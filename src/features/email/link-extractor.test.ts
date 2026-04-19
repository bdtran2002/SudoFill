import { describe, expect, it } from 'vitest';

import { extractMailboxLinks } from './link-extractor';

describe('extractMailboxLinks', () => {
  it('extracts, dedupes, trims punctuation, labels, and caps results', () => {
    const links = extractMailboxLinks(
      null,
      'First https://www.example.com/path), repeat https://example.com/path.',
      'Second source https://subdomain.example.org/one, and bad https://%zz',
      'Third source https://alpha.test/a https://beta.test/b https://gamma.test/c https://delta.test/d https://epsilon.test/e https://zeta.test/f',
    );

    expect(links).toHaveLength(5);
    expect(links).toEqual([
      { label: 'example.com', url: 'https://www.example.com/path' },
      { label: 'example.com', url: 'https://example.com/path' },
      { label: 'subdomain.example.org', url: 'https://subdomain.example.org/one' },
      { label: 'Open link', url: 'https://%zz' },
      { label: 'alpha.test', url: 'https://alpha.test/a' },
    ]);
  });

  it('falls back to Open link when parsing fails', () => {
    expect(extractMailboxLinks('Visit https://%zz')).toEqual([
      { label: 'Open link', url: 'https://%zz' },
    ]);
  });
});
