import { describe, expect, it } from 'vitest';

import {
  buildVerificationPopupPayload,
  findRelatedVerificationMessage,
  isRelatedHostname,
  isVerificationPopupRelevant,
} from './verification-popup';

describe('verification popup helpers', () => {
  it('treats subdomains as related to their registrable parent', () => {
    expect(isRelatedHostname('app.example.com', 'example.com')).toBe(true);
    expect(isRelatedHostname('example.com', 'login.example.com')).toBe(true);
    expect(isRelatedHostname('example.com', 'other-example.com')).toBe(false);
  });

  it('accepts sender-domain matches when the best link uses a different host', () => {
    expect(
      isVerificationPopupRelevant(
        'app.example.com',
        {
          bestLink: { label: 'Verify', url: 'https://trk.mailvendor.net/redirect' },
          linkCandidates: [],
          bestCode: null,
          codeCandidates: [],
        },
        'Example <no-reply@example.com>',
      ),
    ).toBe(true);
  });

  it('shapes popup payloads from verification messages', () => {
    expect(
      buildVerificationPopupPayload({
        id: '1',
        from: 'Example <no-reply@example.com>',
        subject: 'Verify your account',
        intro: '',
        createdAt: '',
        seen: false,
        hasAttachments: false,
        to: [],
        text: '',
        html: '',
        links: [],
        verification: {
          bestLink: { label: 'Verify with this link', url: 'https://app.example.com/verify' },
          linkCandidates: [],
          bestCode: { label: 'Verification code', code: '123456' },
          codeCandidates: [],
        },
      }),
    ).toEqual({
      senderLabel: 'example.com',
      subject: 'Verify your account',
      messageId: '1',
      link: { label: 'Verify with this link', url: 'https://app.example.com/verify' },
      code: { label: 'Verification code', code: '123456' },
    });
  });

  it('chooses the newest relevant verification message', () => {
    const messages = [
      {
        id: 'older',
        from: 'Example <no-reply@example.com>',
        subject: 'Older code',
        intro: '',
        createdAt: '2025-01-01T00:00:00.000Z',
        seen: false,
        hasAttachments: false,
      },
      {
        id: 'newer',
        from: 'Example <no-reply@example.com>',
        subject: 'Newer code',
        intro: '',
        createdAt: '2025-01-02T00:00:00.000Z',
        seen: false,
        hasAttachments: false,
      },
    ];
    const detailsById = {
      older: {
        ...messages[0],
        to: [],
        text: '',
        html: '',
        links: [],
        verification: {
          bestLink: { label: 'Verify', url: 'https://app.example.com/verify?old=1' },
          linkCandidates: [],
          bestCode: { label: 'Verification code', code: '111111' },
          codeCandidates: [],
        },
      },
      newer: {
        ...messages[1],
        to: [],
        text: '',
        html: '',
        links: [],
        verification: {
          bestLink: { label: 'Verify', url: 'https://app.example.com/verify?new=1' },
          linkCandidates: [],
          bestCode: { label: 'Verification code', code: '222222' },
          codeCandidates: [],
        },
      },
    };

    expect(
      findRelatedVerificationMessage('app.example.com', messages, (messageId) =>
        detailsById[messageId as keyof typeof detailsById] ?? null,
      ),
    ).toMatchObject({ messageId: 'newer', subject: 'Newer code' });
  });
});
