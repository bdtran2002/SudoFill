import { describe, expect, it } from 'vitest';

import {
  getAutofillErrorMessage,
  getAutofillResponseMessage,
  getUnsupportedAutofillPageMessage,
  normalizeAutofillTabError,
} from './popup-errors';

describe('popup autofill error helpers', () => {
  it('normalizes unsupported tab urls before messaging', () => {
    expect(normalizeAutofillTabError(undefined)).toBe(
      'Open a page first, then try autofill again.',
    );
    expect(normalizeAutofillTabError({ id: 1, url: 'chrome://settings' })).toBe(
      getUnsupportedAutofillPageMessage(),
    );
    expect(normalizeAutofillTabError({ id: 1, url: 'https://example.com' })).toBeNull();
  });

  it('normalizes content-script transport failures', () => {
    expect(
      getAutofillErrorMessage(
        new Error('Could not establish connection. Receiving end does not exist.'),
        {
          url: 'https://example.com',
        },
      ),
    ).toBe(getUnsupportedAutofillPageMessage());

    expect(
      getAutofillErrorMessage(new Error('Cannot access contents of url "chrome://extensions".'), {
        url: 'chrome://extensions',
      }),
    ).toBe(getUnsupportedAutofillPageMessage());
  });

  it('preserves non-transport errors', () => {
    expect(
      getAutofillErrorMessage(new Error('Malformed autofill profile payload.'), {
        url: 'https://example.com',
      }),
    ).toBe('Malformed autofill profile payload.');
  });

  it('normalizes content responses for unsupported pages and empty matches', () => {
    expect(
      getAutofillResponseMessage({ ok: false, filledCount: 0, fields: [], error: undefined }),
    ).toBe('No supported fields found on this page.');

    expect(
      getAutofillResponseMessage({
        ok: false,
        filledCount: 0,
        fields: [],
        error: 'Autofill failed on this page.',
      }),
    ).toBe('No supported fields found on this page.');
  });

  it('formats success responses', () => {
    expect(getAutofillResponseMessage({ ok: true, filledCount: 1, fields: ['email'] })).toBe(
      'Filled 1 field.',
    );
    expect(getAutofillResponseMessage({ ok: true, filledCount: 3, fields: ['email'] })).toBe(
      'Filled 3 fields.',
    );
  });
});
