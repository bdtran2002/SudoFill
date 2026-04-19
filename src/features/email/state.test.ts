import { describe, expect, it } from 'vitest';

import { EMPTY_MAILBOX_SNAPSHOT, toMailboxSnapshot } from './state';

const messageSummary = {
  id: '1',
  from: 'a',
  subject: 's',
  intro: 'i',
  createdAt: 't',
  seen: false,
  hasAttachments: false,
};

const messageDetail = {
  ...messageSummary,
  to: [],
  text: '',
  html: '',
  links: [],
};

describe('toMailboxSnapshot', () => {
  it('returns the empty snapshot shape for null sessions', () => {
    expect(toMailboxSnapshot(null)).toEqual(EMPTY_MAILBOX_SNAPSHOT);
  });

  it('derives unread count and copies session fields', () => {
    expect(
      toMailboxSnapshot({
        address: 'test@example.com',
        password: 'pw',
        token: 'token',
        accountId: 'account',
        messages: [messageSummary],
        selectedMessageId: '1',
        selectedMessage: messageDetail,
        unreadMessageIds: ['1', '2'],
        knownMessageIds: [],
        lastCheckedAt: 'now',
        createdAt: 'then',
      }),
    ).toEqual({
      status: 'active',
      address: 'test@example.com',
      unreadCount: 2,
      messages: [messageSummary],
      selectedMessageId: '1',
      selectedMessage: messageDetail,
      lastCheckedAt: 'now',
      error: null,
      diagnostics: null,
    });
  });

  it('applies overrides last', () => {
    expect(
      toMailboxSnapshot(null, {
        status: 'error',
        unreadCount: 99,
      }),
    ).toMatchObject({
      status: 'error',
      unreadCount: 99,
    });
  });

  it('lets overrides replace active-session fields', () => {
    expect(
      toMailboxSnapshot(
        {
          address: 'test@example.com',
          password: 'pw',
          token: 'token',
          accountId: 'account',
          messages: [messageSummary],
          selectedMessageId: '1',
          selectedMessage: messageDetail,
          unreadMessageIds: ['1'],
          knownMessageIds: ['1'],
          lastCheckedAt: 'now',
          createdAt: 'then',
        },
        {
          status: 'error',
          messages: [],
          selectedMessageId: null,
          selectedMessage: null,
        },
      ),
    ).toMatchObject({
      status: 'error',
      messages: [],
      selectedMessageId: null,
      selectedMessage: null,
    });
  });
});
