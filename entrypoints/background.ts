import {
  createMailTmSession,
  deleteMailTmAccount,
  getMailTmMessage,
  listMailTmMessages,
} from '../src/features/email/mail-tm';
import { toUnexpectedMailboxError } from '../src/features/email/errors';
import { createMailboxController } from '../src/features/email/controller';
import type { MailboxCommand, MailboxResponse } from '../src/features/email/types';

const isDebugLoggingEnabled = import.meta.env.DEV;

function getBadgeApi() {
  if (chrome.action) {
    return chrome.action;
  }

  return chrome.browserAction;
}

function log(event: string, details?: Record<string, unknown>) {
  if (isDebugLoggingEnabled) {
    console.debug(`[mailbox] ${event}`, details ?? {});
  }
}

function warn(event: string, details?: Record<string, unknown>) {
  console.warn(`[mailbox] ${event}`, details ?? {});
}

function setBadgeBackgroundColor(details: { color: string }) {
  const badgeApi = getBadgeApi();

  if (!badgeApi?.setBadgeBackgroundColor) {
    log('mailbox.badge.unsupported', { method: 'setBadgeBackgroundColor' });
    return Promise.resolve();
  }

  return Promise.resolve().then(() => badgeApi.setBadgeBackgroundColor(details));
}

function setBadgeText(details: { text: string }) {
  const badgeApi = getBadgeApi();

  if (!badgeApi?.setBadgeText) {
    log('mailbox.badge.unsupported', { method: 'setBadgeText' });
    return Promise.resolve();
  }

  return Promise.resolve().then(() => badgeApi.setBadgeText(details));
}

export default defineBackground(() => {
  const controller = createMailboxController({
    createMailTmSession,
    deleteMailTmAccount,
    getMailTmMessage,
    listMailTmMessages,
    storageGet: async (key) => (await chrome.storage.session.get(key)) ?? {},
    storageSet: (items) => chrome.storage.session.set(items),
    storageRemove: (key) => chrome.storage.session.remove(key),
    alarmCreate: (name, alarmInfo) => chrome.alarms.create(name, alarmInfo),
    alarmClear: (name) => chrome.alarms.clear(name),
    setBadgeBackgroundColor,
    setBadgeText,
    openTab: (details) => chrome.tabs.create(details),
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
    log,
    warn,
  });

  void controller.initialize().match(
    () => undefined,
    () => undefined,
  );

  chrome.runtime.onMessage.addListener(
    (message: MailboxCommand, _sender, sendResponse: (response: MailboxResponse) => void) => {
      void controller
        .handleCommand(message)
        .then(sendResponse)
        .catch((error) => {
          warn('mailbox.command.listener.failure', {
            error: error instanceof Error ? error.message : 'Unknown listener failure',
          });

          void controller
            .handleCommand({ type: 'mailbox:get-state' })
            .then((response) => {
              sendResponse({
                ok: false,
                error: toUnexpectedMailboxError(error, 'Mailbox command failed unexpectedly')
                  .message,
                snapshot: response.snapshot,
              });
            })
            .catch(() => {
              sendResponse({
                ok: false,
                error: 'Mailbox command failed unexpectedly',
                snapshot: controller.getSnapshot(),
              });
            });
        });

      return true;
    },
  );

  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    controller.handleAlarm(alarm.name);
  });
});
