import { describe, expect, it } from 'vitest';

import { extractMailboxLinks } from './link-extractor';

describe('extractMailboxLinks', () => {
  it('extracts, dedupes exact duplicates, trims punctuation, labels, and caps results', () => {
    const links = extractMailboxLinks(
      null,
      'First https://www.example.com/path), duplicate https://www.example.com/path.',
      'Second source https://subdomain.example.org/one, and bad https://%zz',
      'Third source https://alpha.test/a https://beta.test/b https://gamma.test/c https://delta.test/d https://epsilon.test/e https://zeta.test/f',
    );

    expect(links).toHaveLength(5);
    expect(links).toEqual([
      { label: 'example.com', url: 'https://www.example.com/path' },
      { label: 'subdomain.example.org', url: 'https://subdomain.example.org/one' },
      { label: 'Open link', url: 'https://%zz' },
      { label: 'alpha.test', url: 'https://alpha.test/a' },
      { label: 'beta.test', url: 'https://beta.test/b' },
    ]);
  });

  it('falls back to Open link when parsing fails', () => {
    expect(extractMailboxLinks('Visit https://%zz')).toEqual([
      { label: 'Open link', url: 'https://%zz' },
    ]);
  });

  it('truncates long hostnames in labels', () => {
    expect(
      extractMailboxLinks('Visit https://averyveryveryveryverylonghostname.example.com/path'),
    ).toEqual([
      {
        label: 'averyveryveryveryverylonghostname...',
        url: 'https://averyveryveryveryverylonghostname.example.com/path',
      },
    ]);
  });
});
