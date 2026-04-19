import { describe, expect, it } from 'vitest';

import { EMPTY_MAILBOX_SNAPSHOT, toMailboxSnapshot } from './state';

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
        messages: [
          {
            id: '1',
            from: 'a',
            subject: 's',
            intro: 'i',
            createdAt: 't',
            seen: false,
            hasAttachments: false,
          },
        ],
        selectedMessageId: '1',
        selectedMessage: {
          id: '1',
          from: 'a',
          subject: 's',
          intro: 'i',
          createdAt: 't',
          seen: false,
          hasAttachments: false,
          to: [],
          text: '',
          html: '',
          links: [],
        },
        unreadMessageIds: ['1', '2'],
        knownMessageIds: [],
        lastCheckedAt: 'now',
        createdAt: 'then',
      }),
    ).toMatchObject({
      status: 'active',
      address: 'test@example.com',
      unreadCount: 2,
      selectedMessageId: '1',
      selectedMessage: expect.any(Object),
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
});
