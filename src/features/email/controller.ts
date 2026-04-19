import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { toMailboxErrorMessage, toUnexpectedMailboxError, type MailboxError } from './errors';
import { EMPTY_MAILBOX_SNAPSHOT, toMailboxSnapshot } from './state';
import type {
  ActiveMailboxSession,
  MailboxCommand,
  MailboxResponse,
  MailboxSnapshot,
} from './types';

export const MAILBOX_STORAGE_KEY = 'email.activeMailbox';
export const MAILBOX_ALARM_NAME = 'email.pollMailbox';
const FAST_POLL_INTERVAL_MS = 4_000;
const FALLBACK_ALARM_PERIOD_MINUTES = 0.5;

type StorageRecord = Record<string, unknown>;

interface MailboxControllerDependencies {
  createMailTmSession: () => ResultAsync<ActiveMailboxSession, MailboxError>;
  deleteMailTmAccount: (session: ActiveMailboxSession) => ResultAsync<void, MailboxError>;
  listMailTmMessages: (
    token: string,
  ) => ResultAsync<ActiveMailboxSession['messages'], MailboxError>;
  getMailTmMessage: (
    token: string,
    messageId: string,
  ) => ResultAsync<ActiveMailboxSession['selectedMessage'], MailboxError>;
  storageGet: (key: string) => Promise<StorageRecord>;
  storageSet: (items: StorageRecord) => Promise<void>;
  storageRemove: (key: string) => Promise<void>;
  alarmCreate: (name: string, alarmInfo: { periodInMinutes: number }) => Promise<void>;
  alarmClear: (name: string) => Promise<boolean>;
  setBadgeBackgroundColor: (details: { color: string }) => Promise<void>;
  setBadgeText: (details: { text: string }) => Promise<void>;
  openTab: (details: { url: string }) => Promise<unknown>;
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
  log: (event: string, details?: Record<string, unknown>) => void;
  warn: (event: string, details?: Record<string, unknown>) => void;
}

type MailboxControllerOverrides = Partial<MailboxControllerDependencies>;

function createNoopLogger() {
  return () => undefined;
}

function createFromAsyncOperation(fallbackMessage: string) {
  return function fromAsyncOperation<T>(operation: () => Promise<T>) {
    return ResultAsync.fromPromise(Promise.resolve().then(operation), (error) =>
      toUnexpectedMailboxError(error, fallbackMessage),
    );
  };
}

function toLogDetails(error: MailboxError) {
  return {
    error: toMailboxErrorMessage(error),
    type: error.type,
  };
}

export function createMailboxController(overrides: MailboxControllerOverrides) {
  const dependencies: MailboxControllerDependencies = {
    createMailTmSession: overrides.createMailTmSession!,
    deleteMailTmAccount: overrides.deleteMailTmAccount!,
    listMailTmMessages: overrides.listMailTmMessages!,
    getMailTmMessage: overrides.getMailTmMessage!,
    storageGet: overrides.storageGet!,
    storageSet: overrides.storageSet!,
    storageRemove: overrides.storageRemove!,
    alarmCreate: overrides.alarmCreate!,
    alarmClear: overrides.alarmClear!,
    setBadgeBackgroundColor: overrides.setBadgeBackgroundColor!,
    setBadgeText: overrides.setBadgeText!,
    openTab: overrides.openTab!,
    setTimeout: overrides.setTimeout ?? setTimeout,
    clearTimeout: overrides.clearTimeout ?? clearTimeout,
    log: overrides.log ?? createNoopLogger(),
    warn: overrides.warn ?? createNoopLogger(),
  };

  let activeSession: ActiveMailboxSession | null = null;
  let currentSnapshot: MailboxSnapshot = EMPTY_MAILBOX_SNAPSHOT;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInFlight: Promise<void> | null = null;

  const fromStorageGet = createFromAsyncOperation('Failed to restore mailbox session');
  const fromStorageSet = createFromAsyncOperation('Failed to update session storage');
  const fromStorageRemove = createFromAsyncOperation('Failed to update session storage');
  const fromAlarmCreate = createFromAsyncOperation('Failed to update mailbox polling alarm');
  const fromAlarmClear = createFromAsyncOperation('Failed to update mailbox polling alarm');
  const fromBadgeBackground = createFromAsyncOperation('Failed to update extension badge');
  const fromBadgeText = createFromAsyncOperation('Failed to update extension badge');
  const fromTabOpen = createFromAsyncOperation('Failed to open mailbox link');
  const fromPollMailbox = createFromAsyncOperation('Failed to refresh mailbox');

  function writeSessionToStorage(): ResultAsync<void, MailboxError> {
    dependencies.log('mailbox.storage.write.start', { hasSession: Boolean(activeSession) });

    if (!activeSession) {
      return fromStorageRemove(() => dependencies.storageRemove(MAILBOX_STORAGE_KEY)).map(() => {
        dependencies.log('mailbox.storage.write.success', { hasSession: false });
        return undefined;
      });
    }

    return fromStorageSet(() =>
      dependencies.storageSet({
        [MAILBOX_STORAGE_KEY]: activeSession,
      }),
    ).map(() => {
      dependencies.log('mailbox.storage.write.success', { hasSession: true });
      return undefined;
    });
  }

  function setBadge(unreadCount: number, error: string | null): ResultAsync<void, MailboxError> {
    dependencies.log('mailbox.badge.update.start', { error: Boolean(error), unreadCount });

    return fromBadgeBackground(() =>
      dependencies.setBadgeBackgroundColor({
        color: error ? '#b91c1c' : '#2563eb',
      }),
    )
      .andThen(() =>
        fromBadgeText(() =>
          dependencies.setBadgeText({
            text: error ? '!' : unreadCount > 0 ? String(Math.min(unreadCount, 99)) : '',
          }),
        ),
      )
      .map(() => {
        dependencies.log('mailbox.badge.update.success', { error: Boolean(error), unreadCount });
        return undefined;
      });
  }

  function updateSnapshot(snapshot: MailboxSnapshot): ResultAsync<void, MailboxError> {
    currentSnapshot = snapshot;
    return setBadge(snapshot.unreadCount, snapshot.error);
  }

  function clearPollTimer() {
    if (pollTimer) {
      dependencies.clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function scheduleFastPoll() {
    clearPollTimer();

    if (!activeSession) {
      return;
    }

    pollTimer = dependencies.setTimeout(() => {
      void pollMailbox();
    }, FAST_POLL_INTERVAL_MS);
  }

  function ensureFallbackAlarm(enabled: boolean): ResultAsync<void, MailboxError> {
    dependencies.log('mailbox.alarm.update.start', { enabled });

    if (!enabled) {
      return fromAlarmClear(() => dependencies.alarmClear(MAILBOX_ALARM_NAME)).map(() => {
        dependencies.log('mailbox.alarm.update.success', { enabled: false });
        return undefined;
      });
    }

    return fromAlarmCreate(() =>
      dependencies.alarmCreate(MAILBOX_ALARM_NAME, {
        periodInMinutes: FALLBACK_ALARM_PERIOD_MINUTES,
      }),
    ).map(() => {
      dependencies.log('mailbox.alarm.update.success', { enabled: true });
      return undefined;
    });
  }

  function replaceSession(
    session: ActiveMailboxSession | null,
    snapshot?: Partial<MailboxSnapshot>,
  ): ResultAsync<void, MailboxError> {
    dependencies.log('mailbox.session.replace.start', { hasSession: Boolean(session) });
    activeSession = session;

    return writeSessionToStorage()
      .andThen(() => ensureFallbackAlarm(Boolean(session)))
      .andThen(() => {
        scheduleFastPoll();
        return updateSnapshot(toMailboxSnapshot(session, snapshot));
      })
      .map(() => {
        dependencies.log('mailbox.session.replace.success', { hasSession: Boolean(session) });
        return undefined;
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

  function pollMailbox(force = false, surfaceErrors = false) {
    if (!activeSession) {
      return Promise.resolve();
    }

    if (pollInFlight) {
      return pollInFlight;
    }

    dependencies.log('mailbox.poll.start', { force });

    const session = activeSession;

    if (!session) {
      return Promise.resolve();
    }

    const nextPoll = dependencies
      .listMailTmMessages(session.token)
      .andThen((messages) => {
        syncMessages(session, messages);

        if (session.selectedMessageId && (!session.selectedMessage || force)) {
          return dependencies
            .getMailTmMessage(session.token, session.selectedMessageId)
            .andThen((message) => {
              session.selectedMessage = message;
              return okAsync(undefined);
            });
        }

        return okAsync(undefined);
      })
      .andThen(() => writeSessionToStorage())
      .andThen(() => updateSnapshot(toMailboxSnapshot(session)))
      .map(() => {
        dependencies.log('mailbox.poll.success', {
          force,
          unreadCount: session.unreadMessageIds.length,
        });
        return undefined;
      })
      .orElse((error) => {
        dependencies.warn('mailbox.poll.failure', {
          ...toLogDetails(error),
          force,
        });

        return updateSnapshot(toMailboxSnapshot(session, { error: toMailboxErrorMessage(error) }))
          .orElse(() => okAsync(undefined))
          .andThen(() => (surfaceErrors ? errAsync(error) : okAsync(undefined)));
      })
      .match(
        () => undefined,
        (error) => {
          throw error;
        },
      )
      .finally(() => {
        pollInFlight = null;
        scheduleFastPoll();
      });

    pollInFlight = nextPoll;

    return nextPoll;
  }

  function createMailbox(): ResultAsync<void, MailboxError> {
    dependencies.log('mailbox.create.start');

    return updateSnapshot({
      ...EMPTY_MAILBOX_SNAPSHOT,
      status: 'creating',
    })
      .andThen(() => dependencies.createMailTmSession())
      .andThen((session) => {
        dependencies.log('mailbox.create.session-created', { address: session.address });
        return replaceSession(session);
      })
      .andThen(() => fromPollMailbox(() => pollMailbox(true, true)))
      .map(() => {
        dependencies.log('mailbox.create.success', { address: currentSnapshot.address });
        return undefined;
      });
  }

  function discardMailbox(): ResultAsync<void, MailboxError> {
    const sessionToDelete = activeSession;
    clearPollTimer();
    dependencies.log('mailbox.discard.start', { hadSession: Boolean(sessionToDelete) });

    return replaceSession(null)
      .andThen(() => {
        if (!sessionToDelete) {
          return okAsync(undefined);
        }

        return dependencies.deleteMailTmAccount(sessionToDelete);
      })
      .map(() => {
        dependencies.log('mailbox.discard.success');
        return undefined;
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
    activeSession.unreadMessageIds = activeSession.unreadMessageIds.filter(
      (id) => id !== messageId,
    );
    activeSession.messages = activeSession.messages.map((message) =>
      message.id === messageId ? { ...message, seen: true } : message,
    );

    return dependencies
      .getMailTmMessage(activeSession.token, messageId)
      .andThen((message) => {
        activeSession!.selectedMessage = message;
        return writeSessionToStorage();
      })
      .andThen(() => updateSnapshot(toMailboxSnapshot(activeSession)));
  }

  function restoreMailboxFromSessionStorage(): ResultAsync<void, MailboxError> {
    dependencies.log('mailbox.restore.start');

    return fromStorageGet(() => dependencies.storageGet(MAILBOX_STORAGE_KEY)).andThen((stored) => {
      const session = stored?.[MAILBOX_STORAGE_KEY] as ActiveMailboxSession | undefined;

      if (!session) {
        return updateSnapshot(EMPTY_MAILBOX_SNAPSHOT).map(() => {
          dependencies.log('mailbox.restore.empty');
          return undefined;
        });
      }

      activeSession = session;
      return ensureFallbackAlarm(true)
        .andThen(() => updateSnapshot(toMailboxSnapshot(activeSession)))
        .andThen(() => {
          scheduleFastPoll();
          return fromPollMailbox(() => pollMailbox());
        })
        .map(() => {
          dependencies.log('mailbox.restore.success', { address: session.address });
          return undefined;
        });
    });
  }

  function handleCommandError(error: MailboxError): Promise<MailboxResponse> {
    dependencies.warn('mailbox.command.failure', toLogDetails(error));

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

  async function handleCommand(command: MailboxCommand): Promise<MailboxResponse> {
    dependencies.log('mailbox.command.start', { type: command.type });

    const response = await ResultAsync.fromPromise(
      (async () => {
        switch (command.type) {
          case 'mailbox:get-state':
            return { ok: true, snapshot: currentSnapshot } as MailboxResponse;
          case 'mailbox:create':
            return createMailbox().match(
              () => ({ ok: true as const, snapshot: currentSnapshot }),
              handleCommandError,
            );
          case 'mailbox:refresh':
            return fromPollMailbox(() => pollMailbox(true, true)).match(
              () => ({ ok: true as const, snapshot: currentSnapshot }),
              handleCommandError,
            );
          case 'mailbox:discard':
            return discardMailbox().match(
              () => ({ ok: true as const, snapshot: currentSnapshot }),
              handleCommandError,
            );
          case 'mailbox:open-message':
            return openMessage(command.messageId).match(
              () => ({ ok: true as const, snapshot: currentSnapshot }),
              handleCommandError,
            );
          case 'mailbox:open-link':
            return fromTabOpen(() => dependencies.openTab({ url: command.url })).match(
              () => ({ ok: true as const, snapshot: currentSnapshot }),
              handleCommandError,
            );
          default:
            return { ok: false as const, error: 'Unknown command', snapshot: currentSnapshot };
        }
      })(),
      (error) => toUnexpectedMailboxError(error, 'Mailbox command failed unexpectedly'),
    ).match((result) => result, handleCommandError);

    dependencies.log('mailbox.command.end', {
      ok: response.ok,
      status: response.snapshot.status,
      type: command.type,
    });

    return response;
  }

  function initialize() {
    return restoreMailboxFromSessionStorage().orElse((error) => {
      dependencies.warn('mailbox.restore.failure', toLogDetails(error));

      return updateSnapshot({
        ...EMPTY_MAILBOX_SNAPSHOT,
        status: 'error',
        error: toMailboxErrorMessage(error),
      }).orElse(() => okAsync(undefined));
    });
  }

  function handleAlarm(alarmName: string) {
    if (alarmName === MAILBOX_ALARM_NAME) {
      void pollMailbox();
    }
  }

  return {
    getSnapshot: () => currentSnapshot,
    handleAlarm,
    handleCommand,
    initialize,
  };
}
