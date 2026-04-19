import { describe, expect, it } from 'vitest';

import { DEFAULT_AUTOFILL_SETTINGS } from './constants';
import { generateAutofillProfile } from './profile';

function getAge(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const birthDate = new Date(year, (month ?? 1) - 1, day ?? 1);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

describe('generateAutofillProfile', () => {
  it('honors selected state and age range', () => {
    const profile = generateAutofillProfile({
      ...DEFAULT_AUTOFILL_SETTINGS,
      state: 'CA',
      ageMin: '24',
      ageMax: '26',
      sex: 'female',
    });

    expect(profile.state).toBe('CA');
    expect(profile.sex).toBe('female');
    expect(getAge(profile.birthDateIso)).toBeGreaterThanOrEqual(24);
    expect(getAge(profile.birthDateIso)).toBeLessThanOrEqual(26);
  });

  it('skips address fields when address generation is disabled', () => {
    const profile = generateAutofillProfile({
      ...DEFAULT_AUTOFILL_SETTINGS,
      generateAddress: false,
    });

    expect(profile.addressLine1).toBe('');
    expect(profile.addressLine2).toBe('');
    expect(profile.city).toBe('');
    expect(profile.postalCode).toBe('');
  });

  it('keeps ISO and split DOB fields on the same date basis', () => {
    const profile = generateAutofillProfile(DEFAULT_AUTOFILL_SETTINGS);

    expect(profile.birthDateIso).toBe(
      `${profile.birthYear}-${profile.birthMonth}-${profile.birthDay}`,
    );
  });
});
