import { useEffect, useState } from 'react';

import {
  getAutofillErrorMessage,
  getAutofillResponseMessage,
  getInvalidAutofillResponseMessage,
  isAutofillContentResponse,
  normalizeAutofillTabError,
} from '../autofill/popup-errors';
import { generateAutofillProfile } from '../autofill/profile';
import { getStoredAutofillSettings } from '../autofill/settings';
import type { AutofillContentResponse } from '../autofill/types';
import {
  AutofillCard,
  type AutofillStatus,
  InboxPanel,
  MailboxErrorPanel,
  MailboxHeader,
  MailboxStatusCard,
} from './mailbox-sections';
import { EMPTY_MAILBOX_SNAPSHOT } from './state';
import type { MailboxCommand, MailboxDiagnostics, MailboxResponse, MailboxSnapshot } from './types';
import { callWebExtensionApi } from '../../lib/webext-async';

function toTransportFailureResponse(
  error: unknown,
  command: MailboxCommand,
  snapshot: MailboxSnapshot,
): MailboxResponse {
  const message = error instanceof Error ? error.message : 'Mailbox request failed';
  const diagnostics: MailboxDiagnostics = {
    command: command.type,
    phase: 'sendMessage',
    errorType: 'transport',
  };

  return {
    ok: false,
    error: message,
    diagnostics,
    snapshot: {
      ...snapshot,
      status: snapshot.address ? 'active' : 'error',
      error: message,
      diagnostics,
    },
  };
}

async function sendMailboxCommand(command: MailboxCommand) {
  return (await callWebExtensionApi<MailboxResponse>(
    'runtime',
    'sendMessage',
    command,
  )) as MailboxResponse;
}

function useCopiedFlash() {
  const [copied, setCopied] = useState(false);

  function flash() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return { copied, flash } as const;
}

export function MailboxApp() {
  const [snapshot, setSnapshot] = useState<MailboxSnapshot>(EMPTY_MAILBOX_SNAPSHOT);
  const [isBusy, setIsBusy] = useState(false);
  const [autofillStatus, setAutofillStatus] = useState<AutofillStatus>({
    tone: 'idle',
    message: 'Generate a profile, then fill the page you already have open.',
  });
  const { copied, flash } = useCopiedFlash();
  const isSidepanel = document.documentElement.classList.contains('sidepanel');

  useEffect(() => {
    let disposed = false;

    async function loadState() {
      const response = await sendMailboxCommand({ type: 'mailbox:get-state' }).catch((error) =>
        toTransportFailureResponse(error, { type: 'mailbox:get-state' }, EMPTY_MAILBOX_SNAPSHOT),
      );
      if (!disposed) setSnapshot(response.snapshot);
    }

    void loadState();
    const interval = window.setInterval(loadState, 2_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  async function runCommand(command: MailboxCommand) {
    setIsBusy(true);
    try {
      const response = await sendMailboxCommand(command).catch((error) =>
        toTransportFailureResponse(error, command, snapshot),
      );
      setSnapshot(response.snapshot);
    } finally {
      setIsBusy(false);
    }
  }

  async function copyAddress() {
    if (!snapshot.address) return;
    await navigator.clipboard.writeText(snapshot.address);
    flash();
  }

  async function autofillCurrentPage() {
    setIsBusy(true);
    let activeTab: chrome.tabs.Tab | undefined;

    try {
      if (!snapshot.address) {
        setAutofillStatus({
          tone: 'error',
          message: 'Create a temp mailbox first, then run autofill.',
        });
        return;
      }

      [activeTab] = await callWebExtensionApi<chrome.tabs.Tab[]>('tabs', 'query', {
        active: true,
        currentWindow: true,
      });

      const tabError = normalizeAutofillTabError(activeTab);

      if (tabError) {
        setAutofillStatus({
          tone: 'error',
          message: tabError,
        });
        return;
      }

      const tabId = activeTab.id;

      if (tabId === undefined) {
        setAutofillStatus({
          tone: 'error',
          message: 'Open a page first, then try autofill again.',
        });
        return;
      }

      const settings = await getStoredAutofillSettings();
      const profile = generateAutofillProfile(settings, { email: snapshot.address });
      const rawResponse = await callWebExtensionApi<unknown>('tabs', 'sendMessage', tabId, {
        type: 'autofill:fill-profile',
        profile,
      });

      if (!isAutofillContentResponse(rawResponse)) {
        setAutofillStatus({
          tone: 'error',
          message: getInvalidAutofillResponseMessage(),
        });
        return;
      }

      const response: AutofillContentResponse = rawResponse;

      if (!response.ok) {
        setAutofillStatus({
          tone: 'error',
          message: getAutofillResponseMessage(response),
        });
        return;
      }

      setAutofillStatus({
        tone: 'success',
        message: getAutofillResponseMessage(response),
      });
    } catch (error) {
      setAutofillStatus({
        tone: 'error',
        message: getAutofillErrorMessage(error, activeTab),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function openAutofillSettings() {
    await callWebExtensionApi('runtime', 'openOptionsPage');
  }

  function createMailbox() {
    void runCommand({ type: 'mailbox:create' });
  }

  function refreshMailbox() {
    void runCommand({ type: 'mailbox:refresh' });
  }

  function discardMailbox() {
    void runCommand({ type: 'mailbox:discard' });
  }

  function openMessage(messageId: string) {
    void runCommand({ type: 'mailbox:open-message', messageId });
  }

  function openMessageLink(url: string) {
    void runCommand({ type: 'mailbox:open-link', url });
  }

  function copyMailboxAddress() {
    void copyAddress();
  }

  function openAutofillSettingsPage() {
    void openAutofillSettings();
  }

  function triggerAutofillCurrentPage() {
    void autofillCurrentPage();
  }

  return (
    <main
      className={`flex h-full min-h-0 w-full font-body text-ink antialiased ${
        isSidepanel
          ? 'overflow-hidden rounded-[28px] border border-border/80 bg-void/92 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm'
          : 'bg-void'
      }`}
    >
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-y-auto ${
          isSidepanel ? 'sidepanel-scroll-region' : ''
        }`}
      >
        <MailboxHeader isSidepanel={isSidepanel} unreadCount={snapshot.unreadCount} />
        <MailboxStatusCard
          copied={copied}
          isBusy={isBusy}
          onCopyAddress={copyMailboxAddress}
          onCreateMailbox={createMailbox}
          onDiscardMailbox={discardMailbox}
          onRefreshMailbox={refreshMailbox}
          snapshot={snapshot}
        />
        <AutofillCard
          autofillStatus={autofillStatus}
          isBusy={isBusy}
          onAutofillCurrentPage={triggerAutofillCurrentPage}
          onOpenAutofillSettings={openAutofillSettingsPage}
        />

        {snapshot.error && (
          <MailboxErrorPanel diagnostics={snapshot.diagnostics} error={snapshot.error} />
        )}

        {snapshot.address && (
          <InboxPanel
            isSidepanel={isSidepanel}
            onOpenLink={openMessageLink}
            onOpenMessage={openMessage}
            snapshot={snapshot}
          />
        )}
      </div>
    </main>
  );
}
