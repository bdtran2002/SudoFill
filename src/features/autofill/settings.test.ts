import { describe, expect, it } from 'vitest';

import { DEFAULT_AUTOFILL_SETTINGS } from './constants';
import { normalizeAutofillSettings } from './settings';

describe('normalizeAutofillSettings', () => {
  it('drops malformed persisted values back to safe defaults', () => {
    expect(
      normalizeAutofillSettings({
        generateAddress: 'yes' as never,
        state: 'ZZ',
        sex: 'robot' as never,
        ageMin: 'abc',
        ageMax: '150',
      }),
    ).toEqual(DEFAULT_AUTOFILL_SETTINGS);
  });

  it('clears inverted age ranges', () => {
    expect(
      normalizeAutofillSettings({
        ...DEFAULT_AUTOFILL_SETTINGS,
        ageMin: '30',
        ageMax: '20',
      }),
    ).toEqual({
      ...DEFAULT_AUTOFILL_SETTINGS,
      ageMin: '30',
      ageMax: '',
    });
  });

  it('never returns undefined for sex', () => {
    expect(normalizeAutofillSettings({ sex: undefined })).toEqual(DEFAULT_AUTOFILL_SETTINGS);
  });

  it('uses the configured sex default for non-string stored values', () => {
    const originalDefaultSex = DEFAULT_AUTOFILL_SETTINGS.sex;
    DEFAULT_AUTOFILL_SETTINGS.sex = 'female';

    try {
      expect(normalizeAutofillSettings({ sex: 123 as never }).sex).toBe('female');
      expect(normalizeAutofillSettings({ sex: undefined }).sex).toBe('female');
    } finally {
      DEFAULT_AUTOFILL_SETTINGS.sex = originalDefaultSex;
    }
  });

  it('uses the configured default state when none is stored', () => {
    expect(normalizeAutofillSettings({})).toEqual(DEFAULT_AUTOFILL_SETTINGS);
  });

  it('preserves an explicit any-state choice', () => {
    expect(normalizeAutofillSettings({ state: '' }).state).toBe('');
  });
});
