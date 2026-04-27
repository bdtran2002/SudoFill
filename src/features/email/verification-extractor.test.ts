import { describe, expect, it } from 'vitest';

import { extractMailboxLinks, extractMailboxVerificationDetails } from './verification-extractor';

describe('verification extractor', () => {
  it('prefers verification links over noisy footer links', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Verify your Example account',
      text: `Click this link to verify your email: https://app.example.com/verify?token=abc123\n\nNeed help? https://example.com/support\nUnsubscribe: https://example.com/unsubscribe`,
      html: '',
    });

    expect(details.bestLink).toEqual({
      label: 'Verify with this link',
      url: 'https://app.example.com/verify?token=abc123',
    });
    expect(details.linkCandidates).toEqual([
      {
        label: 'Verify with this link',
        url: 'https://app.example.com/verify?token=abc123',
      },
    ]);
  });

  it('extracts verification codes from text and html contexts', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Your sign in code',
      text: 'Use verification code 482913 to finish signing in.',
      html: '<p>Security code: <strong>482913</strong></p>',
    });

    expect(details.bestCode).toEqual({
      code: '482913',
      label: 'Sign-in code',
      autofillLabel: 'Fill into active page',
    });
    expect(details.codeCandidates).toEqual([
      { code: '482913', label: 'Sign-in code', autofillLabel: 'Fill into active page' },
    ]);
  });

  it('prefers the actual token over prose like below', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Confirm your account',
      text: 'Your verification code is below: NBW-VOW\n\nIf asked, enter the code below.',
      html: '',
    });

    expect(details.bestCode).toEqual({
      code: 'NBW-VOW',
      label: 'Verification code',
      autofillLabel: 'Fill into active page',
    });
  });

  it('uses anchor text to detect magic links in html emails', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Finish logging in',
      text: '',
      html: '<p><a href="https://auth.example.com/magic-login?token=abc">Sign in to Example</a></p><p><a href="https://example.com/privacy">Privacy policy</a></p>',
    });

    expect(details.bestLink).toEqual({
      label: 'Sign in with this link',
      url: 'https://auth.example.com/magic-login?token=abc',
    });
  });

  it('still returns deduped raw links for broader UI usage', () => {
    expect(
      extractMailboxLinks(
        'Welcome',
        'First https://www.example.com/path), duplicate https://www.example.com/path.',
        'Second source <a href="https://subdomain.example.org/one">Verify</a>',
      ),
    ).toEqual([
      { label: 'Verify with this link', url: 'https://subdomain.example.org/one' },
      { label: 'example.com', url: 'https://www.example.com/path' },
    ]);
  });

  it('drops asset links from the best-link position', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Confirm your email',
      text: 'https://cdn.example.com/logo.png https://example.com/confirm?token=abc',
      html: '',
    });

    expect(details.bestLink?.url).toBe('https://example.com/confirm?token=abc');
  });

  it('keeps weak links out of recommended actions', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Update complete',
      text: 'View details here: https://example.com/account. Support: https://example.com/help',
      html: '',
    });

    expect(details.bestLink).toBeNull();
    expect(details.linkCandidates).toHaveLength(0);
  });
});
