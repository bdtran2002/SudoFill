import { describe, expect, it } from 'vitest';

import { prioritizeDobValues, resolveAutofillMatch } from './matching';

const profile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '555-0100',
  sex: 'female',
  birthDateIso: '1990-01-15',
  birthDay: '15',
  birthMonth: '01',
  birthYear: '1990',
  addressLine1: '123 Main St',
  addressLine2: 'Apt 4',
  city: 'Austin',
  state: 'TX',
  stateName: 'Texas',
  postalCode: '78701',
} as const;

describe('resolveAutofillMatch', () => {
  it('prefers split DOB fields over generic DOB', () => {
    expect(resolveAutofillMatch('date of birth month', profile)?.field).toBe('birthMonth');
    expect(resolveAutofillMatch('birth month', profile)?.field).toBe('birthMonth');
    expect(resolveAutofillMatch('dob', profile)?.field).toBe('birthDateIso');
  });

  it('matches month values by number and name', () => {
    expect(resolveAutofillMatch('birth month', profile)?.values).toEqual([
      '01',
      '1',
      'january',
      'jan',
    ]);
    expect(resolveAutofillMatch('date of birth month', profile)?.field).toBe('birthMonth');
    expect(resolveAutofillMatch('date of birth year', profile)?.field).toBe('birthYear');
  });

  it('avoids obvious false positives for full name fallback', () => {
    expect(resolveAutofillMatch('username', profile)).toBeNull();
    expect(resolveAutofillMatch('company name', profile)).toBeNull();
    expect(resolveAutofillMatch('middle name', profile)).toBeNull();
    expect(resolveAutofillMatch('display name', profile)).toBeNull();
    expect(resolveAutofillMatch('full name', profile)?.field).toBe('fullName');
  });

  it('supports common autocomplete tokens', () => {
    expect(resolveAutofillMatch('given-name', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('family-name', profile)?.field).toBe('lastName');
    expect(resolveAutofillMatch('address-line1', profile)?.field).toBe('addressLine1');
    expect(resolveAutofillMatch('address-line2', profile)?.field).toBe('addressLine2');
    expect(resolveAutofillMatch('address-level1', profile)?.field).toBe('state');
    expect(resolveAutofillMatch('address-level2', profile)?.field).toBe('city');
    expect(resolveAutofillMatch('postal-code', profile)?.field).toBe('postalCode');
    expect(resolveAutofillMatch('bday-day', profile)?.field).toBe('birthDay');
    expect(resolveAutofillMatch('bday-month', profile)?.field).toBe('birthMonth');
    expect(resolveAutofillMatch('bday-year', profile)?.field).toBe('birthYear');
    expect(resolveAutofillMatch('sex', profile)?.field).toBe('sex');
  });

  it('does not match phone-like fields', () => {
    expect(resolveAutofillMatch('phone', profile)).toBeNull();
    expect(resolveAutofillMatch('mobile number', profile)).toBeNull();
    expect(resolveAutofillMatch('tel', profile)).toBeNull();
    expect(resolveAutofillMatch('phonenumber', profile)).toBeNull();
  });

  it('matches common camelCase and concatenated identifiers', () => {
    expect(resolveAutofillMatch('firstName', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('firstname', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('lastName', profile)?.field).toBe('lastName');
    expect(resolveAutofillMatch('lastname', profile)?.field).toBe('lastName');
    expect(resolveAutofillMatch('emailAddress', profile)?.field).toBe('email');
    expect(resolveAutofillMatch('emailaddress', profile)?.field).toBe('email');
    expect(resolveAutofillMatch('phoneNumber', profile)).toBeNull();
    expect(resolveAutofillMatch('phonenumber', profile)).toBeNull();
    expect(resolveAutofillMatch('postalCode', profile)?.field).toBe('postalCode');
    expect(resolveAutofillMatch('postalcode', profile)?.field).toBe('postalCode');
    expect(resolveAutofillMatch('birthDate', profile)?.field).toBe('birthDateIso');
    expect(resolveAutofillMatch('birthdate', profile)?.field).toBe('birthDateIso');
    expect(resolveAutofillMatch('birthMonth', profile)?.field).toBe('birthMonth');
    expect(resolveAutofillMatch('birthmonth', profile)?.field).toBe('birthMonth');
    expect(resolveAutofillMatch('birthDay', profile)?.field).toBe('birthDay');
    expect(resolveAutofillMatch('birthday', profile)?.field).toBe('birthDateIso');
    expect(resolveAutofillMatch('birthYear', profile)?.field).toBe('birthYear');
    expect(resolveAutofillMatch('birthyear', profile)?.field).toBe('birthYear');
  });

  it('offers multiple DOB formats for generic date fields', () => {
    expect(resolveAutofillMatch('dob', profile)?.values).toEqual([
      '1990-01-15',
      '01/15/1990',
      '1/15/1990',
    ]);
    expect(resolveAutofillMatch('date of birth', profile)?.values).toEqual([
      '1990-01-15',
      '01/15/1990',
      '1/15/1990',
    ]);
  });

  it('prioritizes DOB formats using field context', () => {
    expect(
      prioritizeDobValues(['1990-01-15', '01/15/1990', '1/15/1990'], {
        inputType: 'text',
        placeholder: 'MM/DD/YYYY',
        labelText: 'Date of birth',
      }),
    ).toEqual(['01/15/1990', '1990-01-15', '1/15/1990']);

    expect(
      prioritizeDobValues(['01/15/1990', '1/15/1990', '1990-01-15'], {
        inputType: 'date',
        keyText: 'birth date',
      }),
    ).toEqual(['1990-01-15', '01/15/1990', '1/15/1990']);
  });
});
