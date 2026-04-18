import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import {
  toMailboxErrorMessage,
  toUnexpectedMailboxError,
  type MailboxError,
} from '../src/features/email/errors';

import {
  getEmailHistory,
  getEmailVersions,
  getSavedTemplates,
  setEmailHistory,
  setEmailVersions,
  setSavedTemplates,
} from '../src/features/email/state';

import type {
  EmailHistoryItem,
  EmailVersion,
  SavedEmailTemplate,
  ActiveMailboxSession,
  MailboxCommand,
  MailboxResponse,
  MailboxSnapshot,
  MailboxMessageSummary,
  MailMessage,
} from '../src/features/email/types';

import {
  createMailTmSession,
  deleteMailTmAccount,
  getMailTmMessage,
  listMailTmMessages,
} from '../src/features/email/mail-tm';

const MAILBOX_STORAGE_KEY = 'email.activeMailbox';
const MAILBOX_ALARM_NAME = 'email.pollMailbox';
const FAST_POLL_INTERVAL_MS = 3_000;
const FALLBACK_ALARM_PERIOD_MINUTES = 0.5;

let activeSession: ActiveMailboxSession | null = null;
let currentSnapshot: MailboxSnapshot = createEmptyMailboxSnapshot();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight: Promise<void> | null = null;

function getSessionStorageArea(): chrome.storage.StorageArea {
  if (chrome.storage.session) {
    return chrome.storage.session;
  }

  return chrome.storage.local;
}

function createEmptyMailboxSnapshot(): MailboxSnapshot {
  return {
    status: 'idle',
    address: null,
    unreadCount: 0,
    messages: [],
    selectedMessageId: null,
    selectedMessage: null,
    lastCheckedAt: null,
    error: null,
  };
}

function toMailboxSnapshot(
  session: ActiveMailboxSession | null,
  overrides: Partial<MailboxSnapshot> = {},
): MailboxSnapshot {
  if (!session) {
    return {
      ...createEmptyMailboxSnapshot(),
      ...overrides,
    };
  }

  const selectedMessage = session.selectedMessage ?? null;
  const unreadCount = session.unreadMessageIds.length;

  return {
    status: 'active',
    address: session.address,
    unreadCount,
    messages: session.messages,
    selectedMessageId: session.selectedMessageId,
    selectedMessage,
    lastCheckedAt: session.lastCheckedAt,
    error: null,
    ...overrides,
  };
}

function fromBrowserPromise<T>(promise: Promise<T>, fallbackMessage: string) {
  return ResultAsync.fromPromise(promise, (error) =>
    toUnexpectedMailboxError(error, fallbackMessage),
  );
}

function createId(): string {
  return crypto.randomUUID();
}

async function addHistoryItem(item: Omit<EmailHistoryItem, 'id' | 'createdAt'>): Promise<void> {
  const history = await getEmailHistory();
  history.unshift({
    id: createId(),
    createdAt: new Date().toISOString(),
    ...item,
  });
  await setEmailHistory(history.slice(0, 100));
}

async function addVersion(version: Omit<EmailVersion, 'id' | 'createdAt'>): Promise<void> {
  const versions = await getEmailVersions();
  versions.unshift({
    id: createId(),
    createdAt: new Date().toISOString(),
    ...version,
  });
  await setEmailVersions(versions.slice(0, 300));
}

function writeSessionToStorage(): ResultAsync<void, MailboxError> {
  const storageArea = getSessionStorageArea();

  if (!activeSession) {
    return fromBrowserPromise(
      storageArea.remove(MAILBOX_STORAGE_KEY),
      'Failed to update session storage',
    );
  }

  return fromBrowserPromise(
    storageArea.set({
      [MAILBOX_STORAGE_KEY]: activeSession,
    }),
    'Failed to update session storage',
  );
}

function setBadge(unreadCount: number, error: string | null): ResultAsync<void, MailboxError> {
  return fromBrowserPromise(
    chrome.action.setBadgeBackgroundColor({
      color: error ? '#b91c1c' : '#2563eb',
    }),
    'Failed to update extension badge',
  ).andThen(() =>
    fromBrowserPromise(
      chrome.action.setBadgeText({
        text: error ? '!' : unreadCount > 0 ? String(Math.min(unreadCount, 99)) : '',
      }),
      'Failed to update extension badge',
    ),
  );
}

function updateSnapshot(snapshot: MailboxSnapshot): ResultAsync<void, MailboxError> {
  currentSnapshot = snapshot;
  return setBadge(snapshot.unreadCount, snapshot.error);
}

function clearPollTimer() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function scheduleFastPoll() {
  clearPollTimer();

  if (!activeSession) {
    return;
  }

  pollTimer = setTimeout(() => {
    void pollMailbox();
  }, FAST_POLL_INTERVAL_MS);
}

function ensureFallbackAlarm(enabled: boolean): ResultAsync<void, MailboxError> {
  if (!enabled) {
    return fromBrowserPromise(
      chrome.alarms.clear(MAILBOX_ALARM_NAME),
      'Failed to update mailbox polling alarm',
    ).map(() => undefined);
  }

  return fromBrowserPromise(
    chrome.alarms.create(MAILBOX_ALARM_NAME, {
      periodInMinutes: FALLBACK_ALARM_PERIOD_MINUTES,
    }),
    'Failed to update mailbox polling alarm',
  );
}

function replaceSession(
  session: ActiveMailboxSession | null,
  snapshot?: Partial<MailboxSnapshot>,
): ResultAsync<void, MailboxError> {
  activeSession = session;

  return writeSessionToStorage()
    .andThen(() => ensureFallbackAlarm(Boolean(session)))
    .andThen(() => {
      scheduleFastPoll();
      return updateSnapshot(toMailboxSnapshot(session, snapshot));
    });
}

function syncMessages(session: ActiveMailboxSession, nextMessages: MailboxMessageSummary[]) {
  const messages: MailMessage[] = nextMessages.map((msg) => ({
    id: msg.id,
    from: msg.from,
    subject: msg.subject,
    intro: msg.intro,
    createdAt: msg.createdAt,
    seen: msg.seen,
    links: [],
  }));
  const nextMessageIds = new Set(nextMessages.map((message) => message.id));
  const unreadMessageIds = new Set(session.unreadMessageIds);

  for (const message of nextMessages) {
    if (!session.knownMessageIds.includes(message.id)) {
      unreadMessageIds.add(message.id);
    }
  }

  session.messages = messages;
  session.knownMessageIds = nextMessages.map((message) => message.id);
  session.unreadMessageIds = [...unreadMessageIds].filter((messageId) =>
    nextMessageIds.has(messageId),
  );
  session.lastCheckedAt = new Date().toISOString();

  if (session.selectedMessageId && !nextMessageIds.has(session.selectedMessageId)) {
    session.selectedMessageId = null;
    session.selectedMessage = null;
  }
}

function pollMailbox(force = false) {
  if (!activeSession) {
    return Promise.resolve();
  }

  if (pollInFlight) {
    return pollInFlight;
  }

  pollInFlight = (async () => {
    const session = activeSession;

    if (!session) {
      pollInFlight = null;
      scheduleFastPoll();
      return;
    }

    await listMailTmMessages(session.token)
      .andThen((messages) => {
        syncMessages(session, messages);

        if (session.selectedMessageId && (!session.selectedMessage || force)) {
          return getMailTmMessage(session.token, session.selectedMessageId).andThen((message) => {
            session.selectedMessage = message;
            return okAsync(undefined);
          });
        }

        return okAsync(undefined);
      })
      .andThen(() => writeSessionToStorage())
      .andThen(() => updateSnapshot(toMailboxSnapshot(session)))
      .orElse((error) =>
        updateSnapshot(
          toMailboxSnapshot(session, {
            error: toMailboxErrorMessage(error),
          }),
        ).orElse(() => okAsync(undefined)),
      );

    pollInFlight = null;
    scheduleFastPoll();
  })();

  return pollInFlight;
}

function createMailbox(): ResultAsync<void, MailboxError> {
  return updateSnapshot({
    ...createEmptyMailboxSnapshot(),
    status: 'creating',
  })
    .andThen(() => createMailTmSession())
    .andThen((session) => replaceSession(session))
    .andThen(() => fromBrowserPromise(pollMailbox(true), 'Failed to refresh mailbox'));
}

function discardMailbox(): ResultAsync<void, MailboxError> {
  const sessionToDelete = activeSession;
  clearPollTimer();

  return replaceSession(null).andThen(() => {
    if (!sessionToDelete) {
      return okAsync(undefined);
    }

    return deleteMailTmAccount(sessionToDelete);
  });
}

function openMessage(messageId: string): ResultAsync<void, MailboxError> {
  const session = activeSession;

  if (!session) {
    return errAsync({
      type: 'mailbox-missing-session',
      message: 'Create a mailbox first',
    });
  }

  session.selectedMessageId = messageId;
  session.unreadMessageIds = session.unreadMessageIds.filter((id) => id !== messageId);
  session.messages = session.messages.map((message) =>
    message.id === messageId ? { ...message, seen: true } : message,
  );

  return getMailTmMessage(session.token, messageId)
    .andThen((message) => {
      session.selectedMessage = message;
      return writeSessionToStorage();
    })
    .andThen(() => updateSnapshot(toMailboxSnapshot(session)));
}

function restoreMailboxFromSessionStorage(): ResultAsync<void, MailboxError> {
  const storageArea = getSessionStorageArea();

  return fromBrowserPromise(
    storageArea.get(MAILBOX_STORAGE_KEY),
    'Failed to restore mailbox session',
  ).andThen((stored) => {
    const session = stored[MAILBOX_STORAGE_KEY] as ActiveMailboxSession | undefined;

    if (!session) {
      return updateSnapshot(createEmptyMailboxSnapshot());
    }

    activeSession = session;

    return ensureFallbackAlarm(true)
      .andThen(() => updateSnapshot(toMailboxSnapshot(activeSession)))
      .andThen(() => {
        scheduleFastPoll();
        return fromBrowserPromise(pollMailbox(), 'Failed to restore mailbox session');
      });
  });
}

async function handleCommand(command: MailboxCommand): Promise<MailboxResponse> {
  switch (command.type) {
    case 'mailbox:get-state':
      return { ok: true, snapshot: currentSnapshot };

    case 'mailbox:create':
      return createMailbox().match(
        () => ({ ok: true, snapshot: currentSnapshot }),
        handleCommandError,
      );

    case 'mailbox:refresh':
      return fromBrowserPromise(pollMailbox(true), 'Failed to refresh mailbox').match(
        () => ({ ok: true, snapshot: currentSnapshot }),
        handleCommandError,
      );

    case 'mailbox:discard':
      return discardMailbox().match(
        () => ({ ok: true, snapshot: currentSnapshot }),
        handleCommandError,
      );

    case 'mailbox:open-message':
      return openMessage(command.messageId).match(
        () => ({ ok: true, snapshot: currentSnapshot }),
        handleCommandError,
      );

    case 'mailbox:open-link':
      return fromBrowserPromise(
        chrome.tabs.create({ url: command.url }),
        'Failed to open mailbox link',
      ).match(() => ({ ok: true, snapshot: currentSnapshot }), handleCommandError);

    default:
      return { ok: false, error: 'Unknown command', snapshot: currentSnapshot };
  }
}

function handleCommandError(error: MailboxError): Promise<MailboxResponse> {
  const message = toMailboxErrorMessage(error);
  const snapshot = toMailboxSnapshot(activeSession, {
    error: message,
    status: activeSession ? 'active' : 'error',
  });

  return updateSnapshot(snapshot)
    .orElse(() => okAsync(undefined))
    .map(() => ({ ok: false as const, error: message, snapshot }))
    .match(
      (response) => response,
      () => ({ ok: false as const, error: message, snapshot }),
    );
}

export default defineBackground(() => {
  void restoreMailboxFromSessionStorage().orElse((error) =>
    updateSnapshot({
      ...createEmptyMailboxSnapshot(),
      status: 'error',
      error: toMailboxErrorMessage(error),
    }).orElse(() => okAsync(undefined)),
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      try {
        if (message.type === 'saved:list') {
          const templates = await getSavedTemplates();
          const history = await getEmailHistory();
          const versions = await getEmailVersions();

          sendResponse({
            ok: true,
            templates,
            history,
            versions,
          });
          return;
        }

        if (message.type === 'saved:create') {
          const templates = await getSavedTemplates();

          const newTemplate: SavedEmailTemplate = {
            id: createId(),
            name: message.name,
            address: message.address,
            notes: message.notes ?? '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          templates.unshift(newTemplate);
          await setSavedTemplates(templates);
          await addHistoryItem({
            address: newTemplate.address,
            action: 'created',
          });
          await addVersion({
            templateId: newTemplate.id,
            address: newTemplate.address,
            notes: newTemplate.notes,
          });

          sendResponse({ ok: true, template: newTemplate });
          return;
        }

        if (message.type === 'saved:update') {
          const templates = await getSavedTemplates();
          const index = templates.findIndex((item) => item.id === message.id);

          if (index === -1) {
            sendResponse({ ok: false, error: 'Template not found.' });
            return;
          }

          const updated: SavedEmailTemplate = {
            ...templates[index],
            name: message.name ?? templates[index].name,
            address: message.address ?? templates[index].address,
            notes: message.notes ?? templates[index].notes,
            updatedAt: new Date().toISOString(),
          };

          templates[index] = updated;
          await setSavedTemplates(templates);
          await addHistoryItem({
            address: updated.address,
            action: 'edited',
          });
          await addVersion({
            templateId: updated.id,
            address: updated.address,
            notes: updated.notes,
          });

          sendResponse({ ok: true, template: updated });
          return;
        }

        if (message.type === 'saved:delete') {
          const templates = await getSavedTemplates();
          const template = templates.find((item) => item.id === message.id);

          if (!template) {
            sendResponse({ ok: false, error: 'Template not found.' });
            return;
          }

          const filtered = templates.filter((item) => item.id !== message.id);
          await setSavedTemplates(filtered);
          await addHistoryItem({
            address: template.address,
            action: 'deleted',
          });

          sendResponse({ ok: true });
          return;
        }

        if (message.type === 'saved:reuse') {
          const templates = await getSavedTemplates();
          const template = templates.find((item) => item.id === message.id);

          if (!template) {
            sendResponse({ ok: false, error: 'Template not found.' });
            return;
          }

          await addHistoryItem({
            address: template.address,
            action: 'reused',
          });

          sendResponse({
            ok: true,
            template,
          });
          return;
        }

        const response = await handleCommand(message as MailboxCommand);
        sendResponse(response);
      } catch (error) {
        console.error('Background onMessage error:', error);

        const fallbackMessage =
          error instanceof Error ? error.message : 'Unexpected background error';

        const snapshot = {
          ...currentSnapshot,
          status: activeSession ? 'active' : 'error',
          error: fallbackMessage,
        } as MailboxSnapshot;

        currentSnapshot = snapshot;

        sendResponse({
          ok: false,
          error: fallbackMessage,
          snapshot,
        });
      }
    })();

    return true;
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === MAILBOX_ALARM_NAME) {
      void pollMailbox();
    }
  });
});
