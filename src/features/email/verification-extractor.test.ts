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

  it('trims wrapping punctuation from verification links before ranking', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Confirm your account',
      text: 'Confirm your email here: (https://app.example.com/verify?token=abc123). Support: https://example.com/support',
      html: '',
    });

    expect(details.bestLink).toEqual({
      label: 'Verify with this link',
      url: 'https://app.example.com/verify?token=abc123',
    });
  });

  it('selects strongest verification link when several links are present', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Action required for your account',
      text: 'Account overview: https://example.com/account Status: https://example.com/status Confirm your email: https://example.com/email/confirm?token=secure-token',
      html: '',
    });

    expect(details.bestLink?.url).toBe('https://example.com/email/confirm?token=secure-token');
    expect(details.linkCandidates[0]).toEqual({
      label: 'Verify with this link',
      url: 'https://example.com/email/confirm?token=secure-token',
    });
  });

  it('prefers nearby login code over unrelated numeric content', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Your login code',
      text: 'Receipt number 123456: use login code 731942 within 10 minutes.',
      html: '',
    });

    expect(details.bestCode).toEqual({
      code: '731942',
      label: 'Sign-in code',
      autofillLabel: 'Fill into active page',
    });
    expect(details.codeCandidates.map(({ code }) => code)).toEqual(['731942']);
  });

  it('keeps verification codes that appear before the cue text', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Your verification details',
      text: '731942 is your verification code.',
      html: '',
    });

    expect(details.bestCode).toEqual({
      code: '731942',
      label: 'Verification code',
      autofillLabel: 'Fill into active page',
    });
  });

  it('handles irregular spacing in verification cues near the token', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Your sign in code',
      text: 'Use sign   in 731942 within 10 minutes.',
      html: '',
    });

    expect(details.bestCode).toEqual({
      code: '731942',
      label: 'Sign-in code',
      autofillLabel: 'Fill into active page',
    });
  });

  it('uses verification anchor text when HTML link URL is generic', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Verify your email',
      text: '',
      html: '<p><a href="https://example.com/action?id=abc123">Confirm your email</a></p><p><a href="https://example.com/help">Help</a></p>',
    });

    expect(details.bestLink).toEqual({
      label: 'Verify with this link',
      url: 'https://example.com/action?id=abc123',
    });
  });

  it('decodes html entities in verification link hrefs', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Confirm your email',
      text: '',
      html: '<p><a href="https://example.com/confirm?token=abc&amp;source=email">Confirm your email</a></p>',
    });

    expect(details.bestLink).toEqual({
      label: 'Verify with this link',
      url: 'https://example.com/confirm?token=abc&source=email',
    });
  });

  it('decodes numeric and hex html entities in verification link hrefs', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Confirm your email',
      text: '',
      html: '<p><a href="https:&#x2F;&#x2F;example.com&#x2F;confirm?token=abc&#38;source=email&#x26;campaign=verify">Confirm your email</a></p>',
    });

    expect(details.bestLink).toEqual({
      label: 'Verify with this link',
      url: 'https://example.com/confirm?token=abc&source=email&campaign=verify',
    });
  });

  it('decodes supplementary numeric html entities in verification link hrefs', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Confirm your email',
      text: '',
      html: '<p><a href="https://example.com/confirm?emoji=&#128512;&amp;token=abc">Confirm your email</a></p>',
    });

    expect(details.bestLink).toEqual({
      label: 'Verify with this link',
      url: 'https://example.com/confirm?emoji=😀&token=abc',
    });
  });

  it('keeps verification codes when a colon immediately follows the token', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Your access details',
      text: 'ABC123: use this as your sign-in code.',
      html: '',
    });

    expect(details.bestCode).toEqual({
      code: 'ABC123',
      label: 'Sign-in code',
      autofillLabel: 'Fill into active page',
    });
  });

  it('recognizes sign-in cue variants when token appears before the cue text', () => {
    const details = extractMailboxVerificationDetails({
      subject: 'Your access details',
      text: '731942 is your sign-in code.',
      html: '',
    });

    expect(details.bestCode).toEqual({
      code: '731942',
      label: 'Sign-in code',
      autofillLabel: 'Fill into active page',
    });
  });
});
