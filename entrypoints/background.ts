import {
  createMailTmSession,
  deleteMailTmAccount,
  getMailTmMessage,
  listMailTmMessages,
} from '../src/features/email/mail-tm';
import { EMPTY_MAILBOX_SNAPSHOT, toMailboxSnapshot } from '../src/features/email/state';
import type {
  ActiveMailboxSession,
  MailboxCommand,
  MailboxResponse,
  MailboxSnapshot,
} from '../src/features/email/types';

const MAILBOX_STORAGE_KEY = 'email.activeMailbox';
const MAILBOX_ALARM_NAME = 'email.pollMailbox';
const FAST_POLL_INTERVAL_MS = 4_000;
const FALLBACK_ALARM_PERIOD_MINUTES = 0.5;

let activeSession: ActiveMailboxSession | null = null;
let currentSnapshot: MailboxSnapshot = EMPTY_MAILBOX_SNAPSHOT;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight: Promise<void> | null = null;

async function writeSessionToStorage() {
  if (!activeSession) {
    await chrome.storage.session.remove(MAILBOX_STORAGE_KEY);
    return;
  }

  await chrome.storage.session.set({
    [MAILBOX_STORAGE_KEY]: activeSession,
  });
}

async function setBadge(unreadCount: number, error: string | null) {
  await chrome.action.setBadgeBackgroundColor({
    color: error ? '#b91c1c' : '#2563eb',
  });

  await chrome.action.setBadgeText({
    text: error ? '!' : unreadCount > 0 ? String(Math.min(unreadCount, 99)) : '',
  });
}

async function updateSnapshot(snapshot: MailboxSnapshot) {
  currentSnapshot = snapshot;
  await setBadge(snapshot.unreadCount, snapshot.error);
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

async function ensureFallbackAlarm(enabled: boolean) {
  if (!enabled) {
    await chrome.alarms.clear(MAILBOX_ALARM_NAME);
    return;
  }

  await chrome.alarms.create(MAILBOX_ALARM_NAME, {
    periodInMinutes: FALLBACK_ALARM_PERIOD_MINUTES,
  });
}

async function replaceSession(
  session: ActiveMailboxSession | null,
  snapshot?: Partial<MailboxSnapshot>,
) {
  activeSession = session;
  await writeSessionToStorage();
  await ensureFallbackAlarm(Boolean(session));
  scheduleFastPoll();
  await updateSnapshot(toMailboxSnapshot(session, snapshot));
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

async function pollMailbox(force = false) {
  if (!activeSession) {
    return;
  }

  if (pollInFlight) {
    return pollInFlight;
  }

  pollInFlight = (async () => {
    try {
      const messages = await listMailTmMessages(activeSession!.token);
      syncMessages(activeSession!, messages);

      if (activeSession!.selectedMessageId && (!activeSession!.selectedMessage || force)) {
        activeSession!.selectedMessage = await getMailTmMessage(
          activeSession!.token,
          activeSession!.selectedMessageId,
        );
      }

      await writeSessionToStorage();
      await updateSnapshot(toMailboxSnapshot(activeSession));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh mailbox';
      await updateSnapshot(toMailboxSnapshot(activeSession, { error: message }));
    } finally {
      pollInFlight = null;
      scheduleFastPoll();
    }
  })();

  return pollInFlight;
}

async function createMailbox() {
  await updateSnapshot({
    ...EMPTY_MAILBOX_SNAPSHOT,
    status: 'creating',
  });

  const session = await createMailTmSession();
  await replaceSession(session);
  await pollMailbox(true);
}

async function discardMailbox() {
  const sessionToDelete = activeSession;
  clearPollTimer();
  await replaceSession(null);

  if (sessionToDelete) {
    await deleteMailTmAccount(sessionToDelete);
  }
}

async function openMessage(messageId: string) {
  if (!activeSession) {
    throw new Error('Create a mailbox first');
  }

  activeSession.selectedMessageId = messageId;
  activeSession.unreadMessageIds = activeSession.unreadMessageIds.filter((id) => id !== messageId);
  activeSession.messages = activeSession.messages.map((message) =>
    message.id === messageId ? { ...message, seen: true } : message,
  );
  activeSession.selectedMessage = await getMailTmMessage(activeSession.token, messageId);
  await writeSessionToStorage();
  await updateSnapshot(toMailboxSnapshot(activeSession));
}

async function restoreMailboxFromSessionStorage() {
  const stored = await chrome.storage.session.get(MAILBOX_STORAGE_KEY);
  const session = stored[MAILBOX_STORAGE_KEY] as ActiveMailboxSession | undefined;

  if (!session) {
    await updateSnapshot(EMPTY_MAILBOX_SNAPSHOT);
    return;
  }

  activeSession = session;
  await ensureFallbackAlarm(true);
  await updateSnapshot(toMailboxSnapshot(activeSession));
  scheduleFastPoll();
  await pollMailbox();
}

async function handleCommand(command: MailboxCommand): Promise<MailboxResponse> {
  try {
    switch (command.type) {
      case 'mailbox:get-state':
        return { ok: true, snapshot: currentSnapshot };
      case 'mailbox:create':
        await createMailbox();
        return { ok: true, snapshot: currentSnapshot };
      case 'mailbox:refresh':
        await pollMailbox(true);
        return { ok: true, snapshot: currentSnapshot };
      case 'mailbox:discard':
        await discardMailbox();
        return { ok: true, snapshot: currentSnapshot };
      case 'mailbox:open-message':
        await openMessage(command.messageId);
        return { ok: true, snapshot: currentSnapshot };
      case 'mailbox:open-link':
        await chrome.tabs.create({ url: command.url });
        return { ok: true, snapshot: currentSnapshot };
      default:
        return { ok: false, error: 'Unknown command', snapshot: currentSnapshot };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mailbox request failed';
    const snapshot = toMailboxSnapshot(activeSession, {
      error: message,
      status: activeSession ? 'active' : 'error',
    });
    await updateSnapshot(snapshot);
    return { ok: false, error: message, snapshot };
  }
}

export default defineBackground(() => {
  void restoreMailboxFromSessionStorage();

  chrome.runtime.onMessage.addListener(
    (message: MailboxCommand, _sender, sendResponse: (response: MailboxResponse) => void) => {
      void handleCommand(message).then(sendResponse);
      return true;
    },
  );

  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    if (alarm.name === MAILBOX_ALARM_NAME) {
      void pollMailbox();
    }
  });
});
