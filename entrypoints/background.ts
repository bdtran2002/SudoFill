import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import {
  getMailboxErrorType,
  toMailboxErrorMessage,
  toUnexpectedMailboxError,
  type MailboxError,
} from '../src/features/email/errors';
import {
  createMailTmSession,
  deleteMailTmAccount,
  getMailTmMessage,
  listMailTmMessages,
} from '../src/features/email/mail-tm';
import { EMPTY_MAILBOX_SNAPSHOT, toMailboxSnapshot } from '../src/features/email/state';
import { createCommandHandler } from '../src/features/email/command-router';
import type {
  ActiveMailboxSession,
  MailboxCommand,
  MailboxDiagnostics,
  MailboxResponse,
  MailboxSnapshot,
} from '../src/features/email/types';
import { callWebExtensionApi } from '../src/lib/webext-async';

const MAILBOX_STORAGE_KEY = 'email.activeMailbox';
const MAILBOX_ALARM_NAME = 'email.pollMailbox';
const FAST_POLL_INTERVAL_MS = 4_000;
const FALLBACK_ALARM_PERIOD_MINUTES = 0.5;

let activeSession: ActiveMailboxSession | null = null;
let currentSnapshot: MailboxSnapshot = EMPTY_MAILBOX_SNAPSHOT;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight: Promise<void> | null = null;

type ActionLikeApi = {
  onClicked?: {
    addListener: (callback: (tab: chrome.tabs.Tab) => void) => void;
  };
  setBadgeBackgroundColor?: (details: chrome.action.BadgeColorDetails) => Promise<void>;
  setBadgeText?: (details: chrome.action.BadgeTextDetails) => Promise<void>;
};

type FirefoxBrowserApi = {
  action?: ActionLikeApi;
  browserAction?: ActionLikeApi;
};

function getFirefoxBrowserApi(): FirefoxBrowserApi | undefined {
  return (
    globalThis as typeof globalThis & {
      browser?: FirefoxBrowserApi;
    }
  ).browser;
}

function getActionApi(): ActionLikeApi | undefined {
  const browserApi = getFirefoxBrowserApi();

  return (
    browserApi?.action ??
    browserApi?.browserAction ??
    chrome.action ??
    (
      chrome as typeof chrome & {
        browserAction?: ActionLikeApi;
      }
    ).browserAction
  );
}

function configureSidePanelActionBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  void chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
  });
}

function registerChromeSidePanelActionHandler() {
  if (!chrome.sidePanel?.open || !chrome.action?.onClicked) {
    return;
  }

  chrome.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined) {
      void chrome.sidePanel.open({ tabId: tab.id });
      return;
    }

    if (tab.windowId !== undefined) {
      void chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });
}

function fromBrowserPromise<T>(promise: Promise<T>, fallbackMessage: string) {
  return ResultAsync.fromPromise(promise, (error) =>
    toUnexpectedMailboxError(error, fallbackMessage),
  );
}

function writeSessionToStorage(): ResultAsync<void, MailboxError> {
  if (!activeSession) {
    return fromBrowserPromise(
      callWebExtensionApi('storage', 'session.remove', MAILBOX_STORAGE_KEY),
      'Failed to update session storage',
    );
  }

  return fromBrowserPromise(
    callWebExtensionApi('storage', 'session.set', {
      [MAILBOX_STORAGE_KEY]: activeSession,
    }),
    'Failed to update session storage',
  );
}

function setBadge(unreadCount: number, error: string | null): ResultAsync<void, MailboxError> {
  const actionApi = getActionApi();

  if (!actionApi?.setBadgeBackgroundColor || !actionApi.setBadgeText) {
    return okAsync(undefined);
  }

  const setBadgeBackgroundColor = actionApi.setBadgeBackgroundColor;
  const setBadgeText = actionApi.setBadgeText;
  const hasUnread = unreadCount > 0;

  return fromBrowserPromise(
    setBadgeBackgroundColor({
      color: error ? '#b91c1c' : hasUnread ? '#f97316' : '#2563eb',
    }),
    'Failed to update extension badge',
  ).andThen(() =>
    fromBrowserPromise(
      setBadgeText({
        text: error ? '!' : hasUnread ? String(Math.min(unreadCount, 99)) : '',
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
      callWebExtensionApi('alarms', 'clear', MAILBOX_ALARM_NAME),
      'Failed to update mailbox polling alarm',
    ).map(() => undefined);
  }

  return ResultAsync.fromPromise(
    callWebExtensionApi('alarms', 'create', MAILBOX_ALARM_NAME, {
      periodInMinutes: FALLBACK_ALARM_PERIOD_MINUTES,
    }).then(() => undefined),
    (error) => toUnexpectedMailboxError(error, 'Failed to update mailbox polling alarm'),
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

function syncMessages(
  session: ActiveMailboxSession,
  nextMessages: ActiveMailboxSession['messages'],
) {
  const nextMessageIds = new Set(nextMessages.map((message) => message.id));
  const unreadMessageIds = new Set(session.unreadMessageIds);

  for (const message of nextMessages) {
    if (!session.knownMessageIds.includes(message.id)) {
      unreadMessageIds.add(message.id);
    }
  }

  session.messages = nextMessages;
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
        updateSnapshot(toMailboxSnapshot(session, { error: toMailboxErrorMessage(error) })).orElse(
          () => okAsync(undefined),
        ),
      );

    {
      pollInFlight = null;
      scheduleFastPoll();
    }
  })();

  return pollInFlight;
}

function createMailbox(): ResultAsync<void, MailboxError> {
  return updateSnapshot({
    ...EMPTY_MAILBOX_SNAPSHOT,
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
  if (!activeSession) {
    return errAsync({
      type: 'mailbox-missing-session',
      message: 'Create a mailbox first',
    });
  }

  activeSession.selectedMessageId = messageId;
  activeSession.unreadMessageIds = activeSession.unreadMessageIds.filter((id) => id !== messageId);
  activeSession.messages = activeSession.messages.map((message) =>
    message.id === messageId ? { ...message, seen: true } : message,
  );
  return getMailTmMessage(activeSession.token, messageId)
    .andThen((message) => {
      activeSession!.selectedMessage = message;
      return writeSessionToStorage();
    })
    .andThen(() => updateSnapshot(toMailboxSnapshot(activeSession)));
}

function restoreMailboxFromSessionStorage(): ResultAsync<void, MailboxError> {
  return fromBrowserPromise(
    callWebExtensionApi('storage', 'session.get', MAILBOX_STORAGE_KEY),
    'Failed to restore mailbox session',
  ).andThen((stored) => {
    const session = (stored as Record<string, ActiveMailboxSession | undefined>)[
      MAILBOX_STORAGE_KEY
    ];

    if (!session) {
      return updateSnapshot(EMPTY_MAILBOX_SNAPSHOT);
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

function createMailboxResponseError(
  error: MailboxError,
  diagnostics: MailboxDiagnostics = {},
): Promise<MailboxResponse> {
  const message = toMailboxErrorMessage(error);
  const nextDiagnostics: MailboxDiagnostics = {
    ...diagnostics,
    errorType: getMailboxErrorType(error),
  };
  const snapshot = toMailboxSnapshot(activeSession, {
    error: message,
    diagnostics: nextDiagnostics,
    status: activeSession ? 'active' : 'error',
  });

  return updateSnapshot(snapshot)
    .orElse(() => okAsync(undefined))
    .map(() => ({ ok: false as const, error: message, snapshot, diagnostics: nextDiagnostics }))
    .match(
      (response) => response,
      () => ({ ok: false as const, error: message, snapshot, diagnostics: nextDiagnostics }),
    );
}

const handleCommand = createCommandHandler({
  getSnapshot: () => currentSnapshot,
  createMailbox,
  refreshMailbox: () => fromBrowserPromise(pollMailbox(true), 'Failed to refresh mailbox'),
  discardMailbox,
  openMessage,
  openLink: (url) =>
    fromBrowserPromise(
      callWebExtensionApi('tabs', 'create', { url }),
      'Failed to open mailbox link',
    ).map(() => undefined),
  onError: createMailboxResponseError,
});

function handleCommandError(error: unknown, command: MailboxCommand): Promise<MailboxResponse> {
  return createMailboxResponseError(
    toUnexpectedMailboxError(error, 'Mailbox command failed before responding'),
    {
      command: command.type,
      phase: 'handleCommand',
    },
  );
}

export default defineBackground(() => {
  configureSidePanelActionBehavior();
  registerChromeSidePanelActionHandler();

  void restoreMailboxFromSessionStorage().orElse((error) =>
    updateSnapshot({
      ...EMPTY_MAILBOX_SNAPSHOT,
      status: 'error',
      error: toMailboxErrorMessage(error),
    }).orElse(() => okAsync(undefined)),
  );

  chrome.runtime.onMessage.addListener(
    (message: MailboxCommand, _sender, sendResponse: (response: MailboxResponse) => void) => {
      void handleCommand(message)
        .then(sendResponse)
        .catch((error) => {
          void handleCommandError(error, message).then(sendResponse);
        });
      return true;
    },
  );

  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    if (alarm.name === MAILBOX_ALARM_NAME) {
      void pollMailbox();
    }
  });
});
