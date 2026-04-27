import { describe, expect, it } from 'vitest';

import { extractMailboxLinks } from './link-extractor';

describe('extractMailboxLinks', () => {
  it('extracts, dedupes exact duplicates, trims punctuation, labels, and caps results', () => {
    const links = extractMailboxLinks(
      'Verify your account',
      'First https://www.example.com/path), duplicate https://www.example.com/path.',
      'Second source https://subdomain.example.org/one, and bad https://%zz',
    );

    expect(links).toHaveLength(3);
    expect(links).toEqual([
      { label: 'example.com', url: 'https://www.example.com/path' },
      { label: 'subdomain.example.org', url: 'https://subdomain.example.org/one' },
      { label: 'Open link', url: 'https://%zz' },
    ]);
  });

  it('falls back to Open link when parsing fails', () => {
    expect(extractMailboxLinks('', 'Visit https://%zz')).toEqual([
      { label: 'Open link', url: 'https://%zz' },
    ]);
  });

  it('keeps balanced closing parentheses that are part of the URL', () => {
    expect(
      extractMailboxLinks('', 'Visit https://en.wikipedia.org/wiki/Function_(mathematics).'),
    ).toEqual([
      {
        label: 'en.wikipedia.org',
        url: 'https://en.wikipedia.org/wiki/Function_(mathematics)',
      },
    ]);
  });

  it('truncates long hostnames in labels', () => {
    expect(
      extractMailboxLinks('', 'Visit https://averyveryveryveryverylonghostname.example.com/path'),
    ).toEqual([
      {
        label: 'averyveryveryveryverylonghostname...',
        url: 'https://averyveryveryveryverylonghostname.example.com/path',
      },
    ]);
  });
});
