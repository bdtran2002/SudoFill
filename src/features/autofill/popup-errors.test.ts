import { describe, expect, it } from 'vitest';

import {
  getAutofillErrorMessage,
  getInvalidAutofillResponseMessage,
  getAutofillResponseMessage,
  getUnsupportedAutofillPageMessage,
  isAutofillContentResponse,
  normalizeAutofillTabError,
} from './popup-errors';

describe('popup autofill error helpers', () => {
  it('normalizes unsupported tab urls before messaging', () => {
    expect(normalizeAutofillTabError(undefined)).toBe(
      'Open a page first, then try autofill again.',
    );
    expect(normalizeAutofillTabError({ id: 0, url: 'https://example.com' })).toBeNull();
    expect(normalizeAutofillTabError({ id: 1, url: 'chrome://settings' })).toBe(
      getUnsupportedAutofillPageMessage(),
    );
    expect(normalizeAutofillTabError({ id: 1, pendingUrl: 'edge://extensions' })).toBe(
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

    expect(
      getAutofillErrorMessage(
        new Error('The message port closed before a response was received.'),
        {
          url: 'https://example.com',
        },
      ),
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
      getAutofillResponseMessage({
        ok: false,
        filledCount: 0,
        fields: [],
        error: undefined,
        reason: 'no-fields',
      }),
    ).toBe('No supported fields found on this page.');

    expect(
      getAutofillResponseMessage({
        ok: false,
        filledCount: 0,
        fields: [],
        error: 'Autofill failed on this page.',
        reason: 'runtime',
      }),
    ).toBe('Autofill failed on this page.');
  });

  it('validates autofill response shape', () => {
    expect(isAutofillContentResponse({ ok: true, filledCount: 2, fields: ['email'] })).toBe(true);
    expect(
      isAutofillContentResponse({ ok: false, filledCount: 0, fields: [], reason: 'no-fields' }),
    ).toBe(true);
    expect(isAutofillContentResponse({ ok: true, filledCount: '2', fields: [] })).toBe(false);
    expect(
      isAutofillContentResponse({ ok: false, filledCount: 0, fields: [], reason: 'transport' }),
    ).toBe(false);
  });

  it('provides a message for malformed responses', () => {
    expect(getInvalidAutofillResponseMessage()).toBe(
      'Autofill could not confirm whether the page was filled.',
    );
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
