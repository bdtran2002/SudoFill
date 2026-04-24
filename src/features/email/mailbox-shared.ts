import { useEffect, useRef, useState } from 'react';

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
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function flash() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    setCopied(true);
    timeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      timeoutRef.current = null;
    }, 1500);
  }

  return { copied, flash } as const;
}

export function useMailboxUiVisibilityReporting(isVisible: boolean) {
  const instanceIdRef = useRef(globalThis.crypto?.randomUUID?.() ?? `mailbox-ui-${Date.now()}-${Math.random()}`);

  useEffect(() => {
    void callWebExtensionApi('runtime', 'sendMessage', {
      type: 'mailbox-ui-visibility',
      visible: isVisible,
      instanceId: instanceIdRef.current,
    }).catch(() => undefined);
  }, [isVisible]);

  useEffect(() => {
    return () => {
      void callWebExtensionApi('runtime', 'sendMessage', {
        type: 'mailbox-ui-visibility',
        visible: false,
        instanceId: instanceIdRef.current,
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
}): Promise<void> {
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
