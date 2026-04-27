import { useEffect, useRef, useState } from 'react';

import {
  getAutofillErrorMessage,
  getAutofillResponseMessage,
  getInvalidAutofillResponseMessage,
  isAutofillContentResponse,
  normalizeAutofillTabError,
} from '../autofill/popup-errors';
import { generateAutofillProfile } from '../autofill/profile';
import { appendAutofillUsageHistoryEntry } from '../autofill/history';
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
  return (await callWebExtensionApi<MailboxResponse>(
    'runtime',
    'sendMessage',
    command,
  )) as MailboxResponse;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function isFillablePageTab(tab: chrome.tabs.Tab | undefined) {
  const url = tab?.url ?? tab?.pendingUrl ?? '';

  return /^https:\/\//i.test(url);
}

function getMostRelevantPageTab(tabs: chrome.tabs.Tab[]) {
  return [...tabs].filter(isFillablePageTab).sort((left, right) => {
    if (left.active && !right.active) return -1;
    if (!left.active && right.active) return 1;
    return (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0);
  })[0];
}

function getTabHostname(tab: chrome.tabs.Tab | undefined) {
  const url = tab?.url ?? tab?.pendingUrl ?? '';

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isRelatedHostnameMatch(tabHostname: string, preferredHostname: string) {
  return (
    tabHostname === preferredHostname ||
    tabHostname.endsWith(`.${preferredHostname}`) ||
    preferredHostname.endsWith(`.${tabHostname}`)
  );
}

function isMatchingInteractionTab(
  tab: chrome.tabs.Tab | undefined,
  preferredUrl: string | undefined,
  preferredHostname: string | undefined,
) {
  if (!isFillablePageTab(tab)) {
    return false;
  }

  const tabUrl = tab?.url ?? tab?.pendingUrl ?? '';
  const tabHostname = getTabHostname(tab);

  if (preferredUrl && tabUrl === preferredUrl) {
    return true;
  }

  if (preferredHostname && isRelatedHostnameMatch(tabHostname, preferredHostname)) {
    return true;
  }

  return false;
}

function findPreferredUrlMatch(tabs: chrome.tabs.Tab[], preferredUrl: string | undefined) {
  if (!preferredUrl) {
    return null;
  }

  return (
    tabs.find(
      (tab) => isFillablePageTab(tab) && (tab.url ?? tab.pendingUrl ?? '') === preferredUrl,
    ) ?? null
  );
}

export async function getPageInteractionTab() {
  return getPageInteractionTabForContext();
}

export async function getPageInteractionTabForContext({
  preferredUrl,
  preferredHostname,
}: {
  preferredUrl?: string;
  preferredHostname?: string;
} = {}) {
  const [activeTab] = await callWebExtensionApi<chrome.tabs.Tab[]>('tabs', 'query', {
    active: true,
    currentWindow: true,
  });

  const currentWindowTabs = await callWebExtensionApi<chrome.tabs.Tab[]>('tabs', 'query', {
    currentWindow: true,
  });

  const preferredUrlMatch = findPreferredUrlMatch(currentWindowTabs, preferredUrl);

  if (preferredUrlMatch) {
    return preferredUrlMatch;
  }

  if (isMatchingInteractionTab(activeTab, preferredUrl, preferredHostname)) {
    return activeTab;
  }

  if (isFillablePageTab(activeTab) && !preferredHostname && !preferredUrl) {
    return activeTab;
  }

  const currentWindowMatch = [...currentWindowTabs].find((tab) =>
    isMatchingInteractionTab(tab, preferredUrl, preferredHostname),
  );

  if (currentWindowMatch) {
    return currentWindowMatch;
  }

  const currentWindowCandidate = getMostRelevantPageTab(currentWindowTabs);

  if (currentWindowCandidate) {
    return currentWindowCandidate;
  }

  const allTabs = await callWebExtensionApi<chrome.tabs.Tab[]>('tabs', 'query', {});

  const globalPreferredUrlMatch = findPreferredUrlMatch(allTabs, preferredUrl);

  if (globalPreferredUrlMatch) {
    return globalPreferredUrlMatch;
  }

  return getMostRelevantPageTab(allTabs);
}

function isVerificationFillResponse(value: unknown): value is { ok: boolean } {
  return !!value && typeof value === 'object' && 'ok' in value && typeof value.ok === 'boolean';
}

export async function fillVerificationCodeOnPageForContext(
  code: string,
  context?: { preferredUrl?: string; preferredHostname?: string },
) {
  const targetTab = await getPageInteractionTabForContext(context);

  if (targetTab?.id == null) {
    return false;
  }

  const response = await callWebExtensionApi<unknown>('tabs', 'sendMessage', targetTab.id, {
    type: 'verification:fill-code',
    code,
  });

  return isVerificationFillResponse(response) ? response.ok : false;
}

export async function fillVerificationCodeOnPage(
  code: string,
  context?: { preferredUrl?: string; preferredHostname?: string },
) {
  return fillVerificationCodeOnPageForContext(code, context);
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
  const instanceIdRef = useRef(
    globalThis.crypto?.randomUUID?.() ?? `mailbox-ui-${Date.now()}-${Math.random()}`,
  );
  const instanceId = instanceIdRef.current;

  useEffect(() => {
    void callWebExtensionApi('runtime', 'sendMessage', {
      type: 'mailbox-ui-visibility',
      visible: isVisible,
      instanceId,
    }).catch(() => undefined);

    if (!isVisible) {
      return;
    }

    const heartbeat = window.setInterval(() => {
      void callWebExtensionApi('runtime', 'sendMessage', {
        type: 'mailbox-ui-visibility',
        visible: true,
        instanceId,
      }).catch(() => undefined);
    }, 10_000);

    return () => window.clearInterval(heartbeat);
  }, [instanceId, isVisible]);

  useEffect(() => {
    return () => {
      void callWebExtensionApi('runtime', 'sendMessage', {
        type: 'mailbox-ui-visibility',
        visible: false,
        instanceId,
      }).catch(() => undefined);
    };
  }, [instanceId]);
}

type AutofillStatusSetter = (status: {
  tone: 'idle' | 'success' | 'error';
  message: string;
}) => void;

export const MAILBOX_AUTOFILL_IDLE_MESSAGE =
  'Generate a profile, then fill the page you already have open.';
export const MAILBOX_AUTOFILL_MISSING_MAILBOX_MESSAGE =
  'Create a temp mailbox first, then run autofill.';

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
      setAutofillStatus({ tone: 'error', message: MAILBOX_AUTOFILL_MISSING_MAILBOX_MESSAGE });
      return;
    }

    activeTab = await getPageInteractionTab();

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

    if (settings.saveUsageHistory) {
      try {
        const siteUrl = activeTab.url ?? activeTab.pendingUrl ?? '';
        const siteHostname = (() => {
          try {
            return new URL(siteUrl).hostname;
          } catch {
            return '';
          }
        })();

        if (siteUrl && siteHostname) {
          const saveNameDetails = settings.saveUsageHistoryDetails.name;
          const saveAgeDetails = settings.saveUsageHistoryDetails.age;
          const saveAddressDetails = settings.saveUsageHistoryDetails.address;
          const savePasswordDetails = settings.savePasswordToUsageHistory;

          await appendAutofillUsageHistoryEntry({
            id: globalThis.crypto?.randomUUID?.() ?? `history-${Date.now()}`,
            createdAt: new Date().toISOString(),
            siteHostname,
            siteUrl,
            email: profile.email,
            username: response.inferredUsername ?? profile.email,
            fullName: saveNameDetails ? profile.fullName : '',
            firstName: saveNameDetails ? profile.firstName : '',
            lastName: saveNameDetails ? profile.lastName : '',
            password: savePasswordDetails ? profile.password : '',
            age: saveAgeDetails ? profile.ageAtFill : 0,
            addressLine1: saveAddressDetails ? profile.addressLine1 : '',
            addressLine2: saveAddressDetails ? profile.addressLine2 : '',
            city: saveAddressDetails ? profile.city : '',
            state: saveAddressDetails ? profile.state : '',
            postalCode: saveAddressDetails ? profile.postalCode : '',
          });
        }
      } catch {
        // Ignore history persistence issues so successful autofill stays successful.
      }
    }
  } catch (error) {
    const message = getAutofillErrorMessage(error, activeTab);
    setAutofillStatus({ tone: 'error', message });
    setActionStatus?.({ tone: 'error', message });
  }
}
