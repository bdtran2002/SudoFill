// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  MailboxMessageBody,
  MailboxVerificationActions,
  renderSanitizedHtml,
  renderTextWithLinks,
} from './mailbox-rendering';

describe('mailbox rendering', () => {
  it('linkifies plain-text urls without swallowing trailing punctuation', () => {
    const markup = renderToStaticMarkup(
      createElement('div', null, renderTextWithLinks('Open https://example.com/path).', () => {})),
    );

    expect(markup).toContain('href="https://example.com/path"');
    expect(markup).toContain('https://example.com/path</a>).');
  });

  it('sanitizes html and keeps safe links clickable', () => {
    const markup = renderToStaticMarkup(
      createElement(
        'div',
        null,
        renderSanitizedHtml(
          '<p>Hello <a href="https://example.com/verify">verify</a><script>alert(1)</script></p>',
          () => {},
        ),
      ),
    );

    expect(markup).toContain('href="https://example.com/verify"');
    expect(markup).not.toContain('script');
    expect(markup).toContain('Hello');
  });

  it('renders recommended link and code actions', () => {
    const markup = renderToStaticMarkup(
      createElement(MailboxVerificationActions, {
        verification: {
          bestLink: { label: 'Verify with this link', url: 'https://example.com/verify' },
          linkCandidates: [
            { label: 'Verify with this link', url: 'https://example.com/verify' },
            { label: 'example.com', url: 'https://example.com/help' },
          ],
          bestCode: { code: '482913', label: 'Verification code' },
          codeCandidates: [
            { code: '482913', label: 'Verification code' },
            { code: 'ABC123', label: 'Sign-in code' },
          ],
        },
        onOpenLink: () => {},
        onFillCode: () => {},
      }),
    );

    expect(markup).toContain('Recommended actions');
    expect(markup).toContain('Verify with this link');
    expect(markup).toContain('482913');
    expect(markup).toContain('Fill');
    expect(markup).toContain('Secondary actions');
    expect(markup).toContain('ABC123');
  });

  it('hides recommended links when confidence is low', () => {
    const markup = renderToStaticMarkup(
      createElement(MailboxVerificationActions, {
        verification: {
          bestLink: null,
          linkCandidates: [{ label: 'example.com', url: 'https://example.com/account' }],
          bestCode: null,
          codeCandidates: [],
        },
        onOpenLink: () => {},
      }),
    );

    expect(markup).not.toContain('Recommended actions');
    expect(markup).not.toContain('example.com');
  });

  it('prefers html body rendering when available', () => {
    const markup = renderToStaticMarkup(
      createElement(MailboxMessageBody, {
        message: {
          text: 'Plain fallback',
          html: '<p>HTML body</p>',
        },
        onOpenLink: () => {},
      }),
    );

    expect(markup).toContain('HTML body');
    expect(markup).not.toContain('Plain fallback');
  });

  it('falls back to plain text when sanitized html is empty', () => {
    const markup = renderToStaticMarkup(
      createElement(MailboxMessageBody, {
        message: {
          text: 'Plain fallback',
          html: '<div><span> </span><script>alert(1)</script></div>',
        },
        onOpenLink: () => {},
      }),
    );

    expect(markup).toContain('Plain fallback');
    expect(markup).not.toContain('script');
  });
});
