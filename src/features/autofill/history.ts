import { AUTOFILL_USAGE_HISTORY_STORAGE_KEY } from './constants';
import type { AutofillUsageHistoryEntry } from './types';
import { callWebExtensionApi } from '../../lib/webext-async';

const MAX_AUTOFILL_USAGE_HISTORY_ENTRIES = 250;

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeUsageHistoryEntry(
  value: Partial<AutofillUsageHistoryEntry> | null | undefined,
): AutofillUsageHistoryEntry | null {
  if (!value) {
    return null;
  }

  const email = normalizeString(value.email).toLowerCase();
  const siteUrl = normalizeString(value.siteUrl);
  const id = normalizeString(value.id);
  const createdAt = normalizeString(value.createdAt);
  const siteHostname = normalizeString(value.siteHostname).toLowerCase();

  if (!email || !siteUrl || !id || !createdAt || !siteHostname) {
    return null;
  }

  return {
    id,
    createdAt,
    siteHostname,
    siteUrl,
    email,
    username: normalizeString(value.username) || email,
    password: normalizeString(value.password),
    fullName: normalizeString(value.fullName),
    firstName: normalizeString(value.firstName),
    lastName: normalizeString(value.lastName),
    age: typeof value.age === 'number' && Number.isFinite(value.age) ? value.age : 0,
    addressLine1: normalizeString(value.addressLine1),
    addressLine2: normalizeString(value.addressLine2),
    city: normalizeString(value.city),
    state: normalizeString(value.state),
    postalCode: normalizeString(value.postalCode),
  };
}

export function normalizeAutofillUsageHistory(value: unknown): AutofillUsageHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((candidate) => normalizeUsageHistoryEntry(candidate))
    .filter((candidate): candidate is AutofillUsageHistoryEntry => Boolean(candidate))
    .slice(0, MAX_AUTOFILL_USAGE_HISTORY_ENTRIES);
}

export async function getStoredAutofillUsageHistory() {
  const result = await callWebExtensionApi<Record<string, unknown>>(
    'storage',
    'local.get',
    AUTOFILL_USAGE_HISTORY_STORAGE_KEY,
  );

  return normalizeAutofillUsageHistory(result[AUTOFILL_USAGE_HISTORY_STORAGE_KEY]);
}

export async function setStoredAutofillUsageHistory(entries: AutofillUsageHistoryEntry[]) {
  const normalizedEntries = normalizeAutofillUsageHistory(entries);

  await callWebExtensionApi('storage', 'local.set', {
    [AUTOFILL_USAGE_HISTORY_STORAGE_KEY]: normalizedEntries,
  });
}

export async function clearStoredAutofillUsageHistory() {
  await callWebExtensionApi('storage', 'local.remove', AUTOFILL_USAGE_HISTORY_STORAGE_KEY);
}

export async function appendAutofillUsageHistoryEntry(entry: AutofillUsageHistoryEntry) {
  const normalizedEntry = normalizeUsageHistoryEntry(entry);

  if (!normalizedEntry) {
    throw new Error('Malformed usage history entry.');
  }

  const existingEntries = await getStoredAutofillUsageHistory();
  const nextEntries = [
    normalizedEntry,
    ...existingEntries.filter(({ id, email, siteUrl, createdAt }) => {
      if (id === normalizedEntry.id) return false;
      return !(
        email === normalizedEntry.email &&
        siteUrl === normalizedEntry.siteUrl &&
        createdAt === normalizedEntry.createdAt
      );
    }),
  ];

  await setStoredAutofillUsageHistory(nextEntries);
}

export async function deleteAutofillUsageHistoryEntryById(id: string) {
  const normalizedId = normalizeString(id);

  if (!normalizedId) {
    return;
  }

  const existingEntries = await getStoredAutofillUsageHistory();
  await setStoredAutofillUsageHistory(existingEntries.filter((entry) => entry.id !== normalizedId));
}
