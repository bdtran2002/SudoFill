import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendAutofillUsageHistoryEntry,
  clearStoredAutofillUsageHistory,
  getStoredAutofillUsageHistory,
  normalizeAutofillUsageHistory,
  normalizeUsageHistoryEntry,
  setStoredAutofillUsageHistory,
} from './history';

const localStorageState: Record<string, unknown> = {};

vi.mock('../../lib/webext-async', () => ({
  callWebExtensionApi: vi.fn(async (_namespace: string, methodPath: string, ...args: unknown[]) => {
    if (methodPath === 'local.get') {
      const key = args[0] as string;
      return { [key]: localStorageState[key] };
    }

    if (methodPath === 'local.set') {
      Object.assign(localStorageState, args[0] as Record<string, unknown>);
      return undefined;
    }

    if (methodPath === 'local.remove') {
      delete localStorageState[args[0] as string];
      return undefined;
    }

    throw new Error(`Unexpected method: ${methodPath}`);
  }),
}));

const baseEntry = {
  id: 'entry-1',
  createdAt: '2026-04-26T12:00:00.000Z',
  siteHostname: 'example.com',
  siteUrl: 'https://example.com/signup',
  email: 'ada@example.com',
  username: 'ada@example.com',
  fullName: 'Ada Lovelace',
  firstName: 'Ada',
  lastName: 'Lovelace',
  addressLine1: '123 Main St',
  addressLine2: 'Apt 4',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
} as const;

describe('autofill usage history', () => {
  beforeEach(() => {
    for (const key of Object.keys(localStorageState)) {
      delete localStorageState[key];
    }
  });

  it('normalizes valid entries and defaults username to email', () => {
    expect(normalizeUsageHistoryEntry({ ...baseEntry, username: '  ' })).toEqual({
      ...baseEntry,
      username: baseEntry.email,
    });
  });

  it('drops malformed entries and malformed arrays', () => {
    expect(normalizeUsageHistoryEntry({ ...baseEntry, email: ' ' })).toBeNull();
    expect(normalizeAutofillUsageHistory('bad')).toEqual([]);
    expect(
      normalizeAutofillUsageHistory([baseEntry, { nope: true }, { ...baseEntry, id: '' }]),
    ).toEqual([baseEntry]);
  });

  it('reads and writes normalized history entries', async () => {
    await setStoredAutofillUsageHistory([{ ...baseEntry, email: ' ADA@EXAMPLE.COM ' }]);

    await expect(getStoredAutofillUsageHistory()).resolves.toEqual([
      {
        ...baseEntry,
        email: 'ada@example.com',
      },
    ]);
  });

  it('prepends appended entries and removes duplicate ids', async () => {
    await setStoredAutofillUsageHistory([baseEntry]);
    await appendAutofillUsageHistoryEntry({
      ...baseEntry,
      id: 'entry-2',
      siteHostname: 'app.example.com',
      siteUrl: 'https://app.example.com/join',
    });
    await appendAutofillUsageHistoryEntry({
      ...baseEntry,
      id: 'entry-1',
      siteHostname: 'shop.example.com',
      siteUrl: 'https://shop.example.com/signup',
    });

    await expect(getStoredAutofillUsageHistory()).resolves.toEqual([
      {
        ...baseEntry,
        id: 'entry-1',
        siteHostname: 'shop.example.com',
        siteUrl: 'https://shop.example.com/signup',
      },
      {
        ...baseEntry,
        id: 'entry-2',
        siteHostname: 'app.example.com',
        siteUrl: 'https://app.example.com/join',
      },
    ]);
  });

  it('clears stored history', async () => {
    await setStoredAutofillUsageHistory([baseEntry]);
    await clearStoredAutofillUsageHistory();

    await expect(getStoredAutofillUsageHistory()).resolves.toEqual([]);
  });
});
