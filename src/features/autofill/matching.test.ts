import { describe, expect, it } from 'vitest';

import { prioritizeDobValues, resolveAutofillMatch } from './matching';

const profile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  businessName: 'Ada Labs LLC',
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
  country: 'US',
  countryName: 'United States',
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

  it('keeps obvious false positives blocked while matching business names', () => {
    expect(resolveAutofillMatch('username', profile)).toBeNull();
    expect(resolveAutofillMatch('company name', profile)?.field).toBe('businessName');
    expect(resolveAutofillMatch('business name', profile)?.field).toBe('businessName');
    expect(resolveAutofillMatch('legal business name', profile)?.field).toBe('businessName');
    expect(resolveAutofillMatch('organization name', profile)?.field).toBe('businessName');
    expect(resolveAutofillMatch('organisation name', profile)?.field).toBe('businessName');
    expect(resolveAutofillMatch('middle name', profile)).toBeNull();
    expect(resolveAutofillMatch('display name', profile)).toBeNull();
    expect(resolveAutofillMatch('maiden name', profile)).toBeNull();
    expect(resolveAutofillMatch('nickname', profile)).toBeNull();
    expect(resolveAutofillMatch('project name', profile)).toBeNull();
    expect(resolveAutofillMatch('team name', profile)).toBeNull();
    expect(resolveAutofillMatch('domain name', profile)).toBeNull();
    expect(resolveAutofillMatch('file name', profile)).toBeNull();
    expect(resolveAutofillMatch('login name', profile)).toBeNull();
    expect(resolveAutofillMatch('emergency contact name', profile)).toBeNull();
    expect(resolveAutofillMatch('name on card', profile)).toBeNull();
    expect(resolveAutofillMatch('card name', profile)).toBeNull();
    expect(resolveAutofillMatch('account holder name', profile)).toBeNull();
    expect(resolveAutofillMatch('screen name', profile)).toBeNull();
    expect(resolveAutofillMatch('name', profile)?.field).toBe('fullName');
    expect(resolveAutofillMatch('full name', profile)?.field).toBe('fullName');
  });

  it('supports common autocomplete tokens', () => {
    expect(resolveAutofillMatch('given-name', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('family-name', profile)?.field).toBe('lastName');
    expect(resolveAutofillMatch('country-name', profile)?.field).toBe('country');
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

  it('matches short first and last name field tokens', () => {
    expect(resolveAutofillMatch('first', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('fname', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('forename', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('last', profile)?.field).toBe('lastName');
    expect(resolveAutofillMatch('lname', profile)?.field).toBe('lastName');
  });

  it('fuzzily matches short variant name fields', () => {
    expect(resolveAutofillMatch('given', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('surname', profile)?.field).toBe('lastName');
  });

  it('matches additional safe aliases', () => {
    expect(resolveAutofillMatch('given name', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('first_name', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('first name *', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('first name required', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('enter first name', profile)?.field).toBe('firstName');
    expect(resolveAutofillMatch('second name', profile)?.field).toBe('lastName');
    expect(resolveAutofillMatch('complete name', profile)?.field).toBe('fullName');
    expect(resolveAutofillMatch('birthdate', profile)?.field).toBe('birthDateIso');
    expect(resolveAutofillMatch('dateofbirth', profile)?.field).toBe('birthDateIso');
    expect(resolveAutofillMatch('e-mail address', profile)?.field).toBe('email');
    expect(resolveAutofillMatch('login identifier', profile)?.field).toBe('email');
    expect(resolveAutofillMatch('loginid', profile)?.field).toBe('email');
  });

  it('keeps obvious non-matches blocked', () => {
    expect(resolveAutofillMatch('preferred name', profile)).toBeNull();
    expect(resolveAutofillMatch('cardholder name', profile)).toBeNull();
    expect(resolveAutofillMatch('preferred first name', profile)).toBeNull();
    expect(resolveAutofillMatch('display last name', profile)).toBeNull();
    expect(resolveAutofillMatch('login history', profile)).toBeNull();
    expect(resolveAutofillMatch('expiry month', profile)).toBeNull();
  });

  it('fuzzily matches a generic full name field', () => {
    expect(resolveAutofillMatch('your name', profile)?.field).toBe('fullName');
  });

  it('maps hybrid contact fields to email', () => {
    expect(resolveAutofillMatch('phone number or email', profile)?.field).toBe('email');
    expect(resolveAutofillMatch('email or phone', profile)?.field).toBe('email');
    expect(resolveAutofillMatch('phone/email', profile)?.field).toBe('email');
    expect(resolveAutofillMatch('login email', profile)?.field).toBe('email');
  });

  it('avoids false positives for non-name first and last fields', () => {
    expect(resolveAutofillMatch('first purchase date', profile)).toBeNull();
    expect(resolveAutofillMatch('last login', profile)).toBeNull();
  });

  it('matches country fields with common United States aliases', () => {
    expect(resolveAutofillMatch('country', profile)?.values).toEqual([
      'United States',
      'United States of America',
      'America',
      'USA',
      'US',
    ]);
    expect(resolveAutofillMatch('country region', profile)?.field).toBe('country');
  });

  it('only matches region fields when they look address-related', () => {
    expect(resolveAutofillMatch('region', profile)).toBeNull();
    expect(resolveAutofillMatch('billing region', profile)?.field).toBe('state');
    expect(resolveAutofillMatch('shipping region', profile)?.field).toBe('state');
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
