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
const UI_OPEN_POLL_INTERVAL_MS = 500;
const UI_CLOSED_POLL_INTERVAL_MS = 1_000;
const UI_ACTIVE_WINDOW_MS = 60_000;
const FALLBACK_ALARM_PERIOD_MINUTES = 5;

let activeSession: ActiveMailboxSession | null = null;
let currentSnapshot: MailboxSnapshot = EMPTY_MAILBOX_SNAPSHOT;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight: Promise<void> | null = null;
let pendingForcedPoll = false;
let pendingForcedPollWaiters: Array<() => void> = [];
const openMailboxUiInstanceIds = new Set<string>();
let lastMailboxUiClosedAt = 0;

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

type MailboxUiVisibilityMessage = {
  type: 'mailbox-ui-visibility';
  visible: boolean;
  instanceId: string;
};

function isMailboxUiOpen() {
  return openMailboxUiInstanceIds.size > 0;
}

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

function setBadge(
  notificationCount: number,
  error: string | null,
): ResultAsync<void, MailboxError> {
  const actionApi = getActionApi();

  if (!actionApi?.setBadgeBackgroundColor || !actionApi.setBadgeText) {
    return okAsync(undefined);
  }

  const setBadgeBackgroundColor = actionApi.setBadgeBackgroundColor;
  const setBadgeText = actionApi.setBadgeText;
  const hasUnread = notificationCount > 0;

  return fromBrowserPromise(
    setBadgeBackgroundColor({
      color: error ? '#b91c1c' : hasUnread ? '#f97316' : '#2563eb',
    }),
    'Failed to update extension badge',
  ).andThen(() =>
    fromBrowserPromise(
      setBadgeText({
        text: error ? '!' : hasUnread ? String(Math.min(notificationCount, 99)) : '',
      }),
      'Failed to update extension badge',
    ),
  );
}

function updateSnapshot(snapshot: MailboxSnapshot): ResultAsync<void, MailboxError> {
  currentSnapshot = {
    ...snapshot,
    pollingActive: shouldPollActively(),
  };
  return setBadge(activeSession?.browserNotificationMessageIds.length ?? 0, currentSnapshot.error);
}

function clearPollTimer() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function shouldPollActively() {
  return (
    Boolean(activeSession) &&
    (isMailboxUiOpen() || Date.now() - lastMailboxUiClosedAt < UI_ACTIVE_WINDOW_MS)
  );
}

function getNextPollDelayMs() {
  return isMailboxUiOpen() ? UI_OPEN_POLL_INTERVAL_MS : UI_CLOSED_POLL_INTERVAL_MS;
}

function schedulePoll() {
  clearPollTimer();

  if (!shouldPollActively()) {
    return;
  }

  pollTimer = setTimeout(() => {
    void pollMailbox();
  }, getNextPollDelayMs());
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
      schedulePoll();
      return updateSnapshot(toMailboxSnapshot(session, snapshot));
    });
}

function syncMessages(
  session: ActiveMailboxSession,
  nextMessages: ActiveMailboxSession['messages'],
) {
  const nextMessageIds = new Set(nextMessages.map((message) => message.id));
  const unreadMessageIds = new Set(session.unreadMessageIds);
  const browserNotificationMessageIds = new Set(session.browserNotificationMessageIds);

  for (const message of nextMessages) {
    if (!session.knownMessageIds.includes(message.id)) {
      unreadMessageIds.add(message.id);
      if (!isMailboxUiOpen()) {
        browserNotificationMessageIds.add(message.id);
      }
    }
  }

  session.messages = nextMessages;
  session.knownMessageIds = nextMessages.map((message) => message.id);
  session.unreadMessageIds = [...unreadMessageIds].filter((messageId) =>
    nextMessageIds.has(messageId),
  );
  session.browserNotificationMessageIds = isMailboxUiOpen()
    ? []
    : [...browserNotificationMessageIds].filter((messageId) => nextMessageIds.has(messageId));
  session.lastCheckedAt = new Date().toISOString();

  if (session.selectedMessageId && !nextMessageIds.has(session.selectedMessageId)) {
    session.selectedMessageId = null;
    session.selectedMessage = null;
  }
}

function isCurrentSession(session: ActiveMailboxSession) {
  return activeSession === session;
}

function pollMailbox(force = false) {
  if (!activeSession) {
    return Promise.resolve();
  }

  if (pollInFlight) {
    if (force) {
      pendingForcedPoll = true;
      return new Promise<void>((resolve) => {
        pendingForcedPollWaiters.push(resolve);
      });
    }

    return pollInFlight;
  }

  pollInFlight = (async () => {
    const session = activeSession;

    if (!session) {
      pollInFlight = null;
      schedulePoll();
      return;
    }

    await listMailTmMessages(session.token)
      .andThen((messages) => {
        if (!isCurrentSession(session)) {
          return okAsync(undefined);
        }

        syncMessages(session, messages);

        if (session.selectedMessageId && (!session.selectedMessage || force)) {
          return getMailTmMessage(session.token, session.selectedMessageId).andThen((message) => {
            if (!isCurrentSession(session)) {
              return okAsync(undefined);
            }

            session.selectedMessage = message;
            return okAsync(undefined);
          });
        }

        return okAsync(undefined);
      })
      .andThen(() => {
        if (!isCurrentSession(session)) {
          return okAsync(undefined);
        }

        return writeSessionToStorage();
      })
      .andThen(() => {
        if (!isCurrentSession(session)) {
          return okAsync(undefined);
        }

        return updateSnapshot(toMailboxSnapshot(session));
      })
      .orElse((error) =>
        !isCurrentSession(session)
          ? okAsync(undefined)
          : updateSnapshot(
              toMailboxSnapshot(session, { error: toMailboxErrorMessage(error) }),
            ).orElse(() => okAsync(undefined)),
      );

    const shouldRunForcedFollowUp = pendingForcedPoll;
    const forcedPollWaiters = pendingForcedPollWaiters;
    pendingForcedPoll = false;
    pendingForcedPollWaiters = [];
    pollInFlight = null;

    if (shouldRunForcedFollowUp && activeSession) {
      void pollMailbox(true).finally(() => {
        forcedPollWaiters.forEach((resolve) => resolve());
      });
      return;
    }

    forcedPollWaiters.forEach((resolve) => resolve());

    schedulePoll();
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
  const session = activeSession;

  if (!session) {
    return errAsync({
      type: 'mailbox-missing-session',
      message: 'Create a mailbox first',
    });
  }

  return getMailTmMessage(session.token, messageId)
    .andThen((message) => {
      if (!isCurrentSession(session)) {
        return okAsync(undefined);
      }

      session.selectedMessageId = messageId;
      session.selectedMessage = message;
      session.unreadMessageIds = session.unreadMessageIds.filter((id) => id !== messageId);
      session.messages = session.messages.map((summary) =>
        summary.id === messageId ? { ...summary, seen: true } : summary,
      );

      if (!isCurrentSession(session)) {
        return okAsync(undefined);
      }

      return writeSessionToStorage();
    })
    .andThen(() => {
      if (!isCurrentSession(session)) {
        return okAsync(undefined);
      }

      return updateSnapshot(toMailboxSnapshot(session));
    });
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

    activeSession = {
      ...session,
      browserNotificationMessageIds: session.browserNotificationMessageIds ?? [],
    };
    return ensureFallbackAlarm(true)
      .andThen(() => updateSnapshot(toMailboxSnapshot(activeSession)))
      .andThen(() => {
        schedulePoll();
        if (!shouldPollActively()) {
          return okAsync(undefined);
        }

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
  snapshot.pollingActive = shouldPollActively();

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
    (
      message: MailboxCommand | MailboxUiVisibilityMessage,
      _sender,
      sendResponse: (response: MailboxResponse) => void,
    ) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'mailbox-ui-visibility' &&
        'visible' in message
      ) {
        if (typeof message.instanceId !== 'string' || !message.instanceId) {
          sendResponse({ ok: true, snapshot: currentSnapshot } as MailboxResponse);
          return true;
        }

        if (message.visible) {
          openMailboxUiInstanceIds.add(message.instanceId);
        } else {
          openMailboxUiInstanceIds.delete(message.instanceId);
        }

        let clearedNotificationIds = false;
        if (!isMailboxUiOpen()) {
          lastMailboxUiClosedAt = Date.now();
        } else if (activeSession?.browserNotificationMessageIds.length) {
          activeSession.browserNotificationMessageIds = [];
          clearedNotificationIds = true;
        }

        if (clearedNotificationIds) {
          void writeSessionToStorage().orElse(() => okAsync(undefined));
        }

        schedulePoll();
        currentSnapshot = {
          ...currentSnapshot,
          pollingActive: shouldPollActively(),
        };
        void setBadge(
          activeSession?.browserNotificationMessageIds.length ?? 0,
          currentSnapshot.error,
        );
        sendResponse({ ok: true, snapshot: currentSnapshot } as MailboxResponse);
        return true;
      }

      void handleCommand(message)
        .then(sendResponse)
        .catch((error) => {
          void handleCommandError(error, message).then(sendResponse);
        });
      return true;
    },
  );

  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    if (alarm.name === MAILBOX_ALARM_NAME && activeSession) {
      void pollMailbox();
    }
  });
});
