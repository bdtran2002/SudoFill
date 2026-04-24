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
import { callWebExtensionApi } from '../../lib/webext-async';
import { EMPTY_MAILBOX_SNAPSHOT } from './state';
import type { MailboxCommand, MailboxDiagnostics, MailboxResponse, MailboxSnapshot } from './types';

export function toTransportFailureResponse(
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

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export async function sendMailboxCommand(command: MailboxCommand) {
  return (await callWebExtensionApi<MailboxResponse>('runtime', 'sendMessage', command)) as MailboxResponse;
}

export function useCopiedFlash() {
  const [copied, setCopied] = useState(false);

  function flash() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return { copied, flash } as const;
}

export function useMailboxUiVisibilityReporting(isVisible: boolean) {
  useEffect(() => {
    void callWebExtensionApi('runtime', 'sendMessage', {
      type: 'mailbox-ui-visibility',
      visible: isVisible,
    }).catch(() => undefined);
  }, [isVisible]);

  useEffect(() => {
    return () => {
      void callWebExtensionApi('runtime', 'sendMessage', {
        type: 'mailbox-ui-visibility',
        visible: false,
      }).catch(() => undefined);
    };
  }, []);
}

type AutofillStatusSetter = (status: { tone: 'idle' | 'success' | 'error'; message: string }) => void;

export async function runMailboxAutofillFlow({
  snapshotAddress,
  setAutofillStatus,
  setActionStatus,
}: {
  snapshotAddress: string | null;
  setAutofillStatus: AutofillStatusSetter;
  setActionStatus?: AutofillStatusSetter;
}) {
  let activeTab: chrome.tabs.Tab | undefined;

  try {
    if (!snapshotAddress) {
      setAutofillStatus({ tone: 'error', message: 'Create a temp mailbox first, then run autofill.' });
      return;
    }

    [activeTab] = await callWebExtensionApi<chrome.tabs.Tab[]>('tabs', 'query', {
      active: true,
      currentWindow: true,
    });

    const tabError = normalizeAutofillTabError(activeTab);
    if (tabError) {
      setAutofillStatus({ tone: 'error', message: tabError });
      return;
    }

    const tabId = activeTab.id;
    if (tabId === undefined) {
      setAutofillStatus({ tone: 'error', message: 'Open a page first, then try autofill again.' });
      return;
    }

    const settings = await getStoredAutofillSettings();
    const profile = generateAutofillProfile(settings, { email: snapshotAddress });
    const rawResponse = await callWebExtensionApi<unknown>('tabs', 'sendMessage', tabId, {
      type: 'autofill:fill-profile',
      profile,
    });

    if (!isAutofillContentResponse(rawResponse)) {
      setAutofillStatus({ tone: 'error', message: getInvalidAutofillResponseMessage() });
      return;
    }

    const response: AutofillContentResponse = rawResponse;
    if (!response.ok) {
      setAutofillStatus({ tone: 'error', message: getAutofillResponseMessage(response) });
      return;
    }

    setAutofillStatus({ tone: 'success', message: getAutofillResponseMessage(response) });
    setActionStatus?.({ tone: 'success', message: 'Autofill sent to the active tab.' });
  } catch (error) {
    const message = getAutofillErrorMessage(error, activeTab);
    setAutofillStatus({ tone: 'error', message });
    setActionStatus?.({ tone: 'error', message });
  }
}

export { EMPTY_MAILBOX_SNAPSHOT };
