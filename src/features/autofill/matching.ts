import Fuse from 'fuse.js';

import type { GeneratedProfile } from './types';

export type AutofillFieldMatch = {
  field: keyof GeneratedProfile;
  values: string[];
};

export type AutofillMatchOptions = {
  allowPassword?: boolean;
};

export type DobFieldContext = {
  inputType?: string;
  placeholder?: string;
  labelText?: string;
  keyText?: string;
};

function normalizeFieldKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasToken(key: string, token: string) {
  return new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(key);
}

function hasAnyToken(key: string, tokens: string[]) {
  return tokens.some((token) => hasToken(key, token));
}

function isSplitDobField(key: string) {
  return (
    hasAnyToken(key, ['bday day', 'birth day', 'dob day', 'day of birth']) ||
    (hasToken(key, 'day') && hasAnyToken(key, ['birth', 'dob', 'date of birth'])) ||
    hasAnyToken(key, ['bday month', 'birth month', 'dob month', 'date of birth month']) ||
    (hasToken(key, 'month') && hasAnyToken(key, ['birth', 'dob', 'date of birth'])) ||
    hasToken(key, 'birthmonth') ||
    hasAnyToken(key, ['bday year', 'birth year', 'dob year', 'date of birth year']) ||
    (hasToken(key, 'year') && hasAnyToken(key, ['birth', 'dob', 'date of birth'])) ||
    hasToken(key, 'birthyear')
  );
}

function hasDobPartToken(key: string, part: 'day' | 'month' | 'year') {
  const tokensByPart = {
    day: ['day', 'bday day', 'birth day', 'dob day', 'day of birth', 'birthday'],
    month: ['month', 'bday month', 'birth month', 'dob month', 'birthmonth'],
    year: ['year', 'bday year', 'birth year', 'dob year', 'birthyear'],
  } as const;

  return hasAnyToken(key, [...tokensByPart[part]]);
}

function isAddressLikeRegionField(key: string) {
  return (
    hasToken(key, 'region') &&
    hasAnyToken(key, [
      'address',
      'country',
      'province',
      'state',
      'postal',
      'city',
      'shipping',
      'billing',
    ])
  );
}

function dobValues(profile: GeneratedProfile) {
  const [year, month, day] = [profile.birthYear, profile.birthMonth, profile.birthDay];
  const monthNumber = String(Number(month));
  const dayNumber = String(Number(day));

  return [
    profile.birthDateIso,
    `${month}/${day}/${year}`,
    `${monthNumber}/${dayNumber}/${year}`,
  ].filter((value): value is string => Boolean(value));
}

function birthMonthValues(profile: GeneratedProfile) {
  return [
    profile.birthMonth,
    String(Number(profile.birthMonth)),
    monthName(profile.birthMonth),
    shortMonthName(profile.birthMonth),
  ].filter((value): value is string => Boolean(value));
}

function countryValues(profile: GeneratedProfile) {
  if (!profile.country && !profile.countryName) {
    return [];
  }

  const isUnitedStates = profile.country === 'US' || profile.countryName === 'United States';

  return [
    ...new Set([
      profile.countryName,
      ...(isUnitedStates ? ['United States of America', 'America', 'USA'] : []),
      profile.country,
    ]),
  ].filter((value): value is string => Boolean(value));
}

function isLikelyShortFirstNameField(key: string) {
  if (hasAnyToken(key, ['forename', 'fname'])) {
    return true;
  }

  if (
    hasAnyToken(key, ['preferred', 'display', 'middle', 'company', 'card', 'account', 'screen'])
  ) {
    return false;
  }

  return (
    hasToken(key, 'first') &&
    !hasAnyToken(key, [
      'last',
      'surname',
      'family',
      'company',
      'username',
      'user name',
      'display',
      'preferred',
      'email',
      'address',
      'purchase',
      'order',
      'visit',
      'login',
    ])
  );
}

function isGuardrailedFirstNameLabel(key: string) {
  return hasAnyToken(key, ['preferred', 'display', 'middle', 'card', 'account', 'screen']);
}

function isGuardrailedLastNameLabel(key: string) {
  return hasAnyToken(key, ['preferred', 'display', 'middle', 'card', 'account', 'screen']);
}

function isLikelyShortLastNameField(key: string) {
  if (hasAnyToken(key, ['lname'])) {
    return true;
  }

  if (
    hasAnyToken(key, ['preferred', 'display', 'middle', 'company', 'card', 'account', 'screen'])
  ) {
    return false;
  }

  return (
    hasToken(key, 'last') &&
    !hasAnyToken(key, [
      'first',
      'company',
      'username',
      'user name',
      'display',
      'email',
      'address',
      'purchase',
      'order',
      'visit',
      'login',
      'updated',
      'modified',
      'seen',
    ])
  );
}

export function prioritizeDobValues(values: string[], context: DobFieldContext = {}) {
  const haystack = [context.inputType, context.placeholder, context.labelText, context.keyText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const iso = values.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  const slash = values.find((value) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value));

  if (haystack.includes('date') || haystack.includes('dob') || haystack.includes('birth')) {
    if (context.inputType === 'date' && iso) {
      return [iso, ...values.filter((value) => value !== iso)];
    }

    if (slash) {
      return [slash, ...values.filter((value) => value !== slash)];
    }
  }

  return values;
}

function resolveDobMatch(
  normalizedKey: string,
  profile: GeneratedProfile,
): AutofillFieldMatch | null {
  const isSplitDob = isSplitDobField(normalizedKey);

  if (isSplitDob && hasDobPartToken(normalizedKey, 'month')) {
    return {
      field: 'birthMonth',
      values: birthMonthValues(profile),
    };
  }

  if (isSplitDob && hasDobPartToken(normalizedKey, 'day')) {
    return { field: 'birthDay', values: [profile.birthDay] };
  }

  if (isSplitDob && hasDobPartToken(normalizedKey, 'year')) {
    return { field: 'birthYear', values: [profile.birthYear] };
  }

  if (
    hasAnyToken(normalizedKey, ['birthday', 'dob', 'birth date', 'date of birth']) ||
    hasAnyToken(normalizedKey, ['birthdate', 'dateofbirth'])
  ) {
    return { field: 'birthDateIso', values: dobValues(profile) };
  }

  return null;
}

export function resolveAutofillMatch(
  key: string,
  profile: GeneratedProfile,
  options: AutofillMatchOptions = {},
): AutofillFieldMatch | null {
  const normalizedKey = normalizeFieldKey(key);
  const allowPassword = options.allowPassword ?? false;
  const isUnsafePasswordField =
    hasAnyToken(normalizedKey, [
      'current password',
      'old password',
      'existing password',
      'current passcode',
      'old passcode',
      'existing passcode',
    ]) ||
    hasAnyToken(normalizedKey, [
      'hint',
      'reminder',
      'recovery',
      'security question',
      'password hint',
      'password reminder',
      'password recovery question',
      'password question',
      'password answer',
    ]);
  const guardedNameLabel = hasAnyToken(normalizedKey, [
    'preferred',
    'display',
    'middle',
    'company',
    'card',
    'account',
    'screen',
  ]);

  if (
    (!guardedNameLabel &&
      (hasAnyToken(normalizedKey, ['given name', 'first name']) ||
        hasToken(normalizedKey, 'givenname') ||
        hasToken(normalizedKey, 'firstname'))) ||
    (isLikelyShortFirstNameField(normalizedKey) && !isGuardrailedFirstNameLabel(normalizedKey))
  ) {
    return { field: 'firstName', values: [profile.firstName] };
  }

  if (
    (!guardedNameLabel &&
      (hasAnyToken(normalizedKey, ['family name', 'last name', 'surname']) ||
        hasToken(normalizedKey, 'familyname') ||
        hasToken(normalizedKey, 'lastname'))) ||
    (isLikelyShortLastNameField(normalizedKey) && !isGuardrailedLastNameLabel(normalizedKey))
  ) {
    return { field: 'lastName', values: [profile.lastName] };
  }

  if (hasAnyToken(normalizedKey, ['email', 'e mail']) || hasToken(normalizedKey, 'emailaddress'))
    return { field: 'email', values: [profile.email] };

  if (
    hasAnyToken(normalizedKey, [
      'business name',
      'legal business name',
      'company name',
      'organization name',
      'organisation name',
    ])
  ) {
    return { field: 'businessName', values: [profile.businessName] };
  }

  if (
    hasAnyToken(normalizedKey, ['country', 'country name', 'country region']) ||
    hasToken(normalizedKey, 'countryname')
  ) {
    return { field: 'country', values: countryValues(profile) };
  }

  if (
    hasAnyToken(normalizedKey, [
      'address line 1',
      'address1',
      'address line1',
      'street address',
      'street',
    ])
  ) {
    return { field: 'addressLine1', values: [profile.addressLine1] };
  }
  if (
    hasAnyToken(normalizedKey, [
      'address line 2',
      'address2',
      'address line2',
      'apartment',
      'suite',
      'unit',
    ])
  ) {
    return { field: 'addressLine2', values: [profile.addressLine2] };
  }
  if (hasAnyToken(normalizedKey, ['city', 'town']))
    return { field: 'city', values: [profile.city] };
  if (/address\s*level\s*2/.test(normalizedKey)) return { field: 'city', values: [profile.city] };
  if (/address\s*level\s*1/.test(normalizedKey)) {
    return { field: 'state', values: [profile.state, profile.stateName] };
  }
  if (
    hasAnyToken(normalizedKey, ['state', 'province']) ||
    isAddressLikeRegionField(normalizedKey)
  ) {
    return { field: 'state', values: [profile.state, profile.stateName] };
  }
  if (hasAnyToken(normalizedKey, ['zip', 'postal']) || hasToken(normalizedKey, 'postalcode'))
    return { field: 'postalCode', values: [profile.postalCode] };

  const dobMatch = resolveDobMatch(normalizedKey, profile);
  if (dobMatch) return dobMatch;

  if (hasAnyToken(normalizedKey, ['sex', 'gender'])) return { field: 'sex', values: [profile.sex] };

  if (allowPassword && hasAnyToken(normalizedKey, ['password', 'passcode', 'pass phrase'])) {
    if (isUnsafePasswordField) {
      return null;
    }

    return profile.password ? { field: 'password', values: [profile.password] } : null;
  }

  if (isObviousNameFallback(normalizedKey)) {
    return { field: 'fullName', values: [profile.fullName] };
  }

  return resolveFuzzyFallback(normalizedKey, profile);
}

function monthName(month: string) {
  const index = Number(month) - 1;
  return (
    [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ][index] ?? ''
  );
}

function shortMonthName(month: string) {
  const index = Number(month) - 1;
  return (
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][index] ??
    ''
  );
}

function isObviousNameFallback(key: string) {
  if (hasAnyToken(key, ['full name', 'your name', 'complete name'])) {
    return true;
  }

  const tokens = key.split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => token === 'name');
}

type FuzzyAlias = {
  field: keyof GeneratedProfile;
  alias: string;
};

const FUZZY_THRESHOLD = 0.24;

const FUZZY_ALIASES: FuzzyAlias[] = [
  { field: 'firstName', alias: 'first name' },
  { field: 'firstName', alias: 'given name' },
  { field: 'firstName', alias: 'given names' },
  { field: 'firstName', alias: 'givenname' },
  { field: 'firstName', alias: 'given' },
  { field: 'firstName', alias: 'first' },
  { field: 'firstName', alias: 'first names' },
  { field: 'firstName', alias: 'first_name' },
  { field: 'firstName', alias: 'first name *' },
  { field: 'firstName', alias: 'first name required' },
  { field: 'firstName', alias: 'enter first name' },
  { field: 'firstName', alias: 'guest first name' },
  { field: 'firstName', alias: 'fname' },
  { field: 'firstName', alias: 'forename' },
  { field: 'firstName', alias: 'your first name' },
  { field: 'firstName', alias: 'christian name' },
  { field: 'lastName', alias: 'last name' },
  { field: 'lastName', alias: 'family' },
  { field: 'lastName', alias: 'surname' },
  { field: 'lastName', alias: 'family name' },
  { field: 'lastName', alias: 'familyname' },
  { field: 'lastName', alias: 'last' },
  { field: 'lastName', alias: 'last names' },
  { field: 'lastName', alias: 'last_name' },
  { field: 'lastName', alias: 'lname' },
  { field: 'lastName', alias: 'your last name' },
  { field: 'lastName', alias: 'second name' },
  { field: 'fullName', alias: 'full name' },
  { field: 'fullName', alias: 'your name' },
  { field: 'fullName', alias: 'complete name' },
  { field: 'businessName', alias: 'business name' },
  { field: 'businessName', alias: 'legal business name' },
  { field: 'businessName', alias: 'company name' },
  { field: 'businessName', alias: 'organization name' },
  { field: 'businessName', alias: 'organisation name' },
  { field: 'birthDateIso', alias: 'date of birth' },
  { field: 'birthDateIso', alias: 'dob' },
  { field: 'birthDateIso', alias: 'birth date' },
  { field: 'birthDateIso', alias: 'birthdate' },
  { field: 'birthDateIso', alias: 'birthday' },
  { field: 'birthDateIso', alias: 'date-of-birth' },
  { field: 'email', alias: 'email' },
  { field: 'email', alias: 'e-mail' },
  { field: 'email', alias: 'email address' },
  { field: 'email', alias: 'e-mail address' },
  { field: 'email', alias: 'contact email' },
  { field: 'email', alias: 'phone number or email' },
  { field: 'email', alias: 'email or phone' },
  { field: 'email', alias: 'mobile or email' },
  { field: 'email', alias: 'email or mobile' },
  { field: 'email', alias: 'phone/email' },
  { field: 'email', alias: 'login email' },
  { field: 'email', alias: 'sign in email' },
  { field: 'email', alias: 'account email' },
  { field: 'email', alias: 'login id' },
  { field: 'email', alias: 'loginid' },
  { field: 'email', alias: 'login identifier' },
];

const FUZZY_MATCHER = new Fuse(FUZZY_ALIASES, {
  keys: ['alias'],
  includeScore: true,
  threshold: FUZZY_THRESHOLD,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

function isGuardrailedLabel(key: string) {
  return hasAnyToken(key, [
    'username',
    'display name',
    'brand name',
    'team name',
    'group name',
    'project name',
    'domain name',
    'file name',
    'site name',
    'login name',
    'maiden name',
    'nickname',
    'pet name',
    'preferred name',
    'middle name',
    'account holder name',
    'card name',
    'expiry month',
    'expiration month',
    'expiry year',
    'expiration year',
    'cardholder name',
    'name on card',
    'screen name',
    'search',
    'order',
    'purchase',
    'login history',
  ]);
}

function isPhoneLikeNonEmailLabel(key: string) {
  return hasAnyToken(key, ['phone', 'mobile', 'tel']) && !hasToken(key, 'email');
}

function buildFuzzyMatch(
  field: FuzzyAlias['field'],
  profile: GeneratedProfile,
): AutofillFieldMatch | null {
  switch (field) {
    case 'firstName':
      return { field: 'firstName', values: [profile.firstName] };
    case 'lastName':
      return { field: 'lastName', values: [profile.lastName] };
    case 'fullName':
      return { field: 'fullName', values: [profile.fullName] };
    case 'businessName':
      return { field: 'businessName', values: [profile.businessName] };
    case 'birthDateIso':
      return { field: 'birthDateIso', values: dobValues(profile) };
    case 'email':
      return { field: 'email', values: [profile.email] };
    default:
      return null;
  }
}

function resolveFuzzyFallback(
  normalizedKey: string,
  profile: GeneratedProfile,
): AutofillFieldMatch | null {
  if (isGuardrailedLabel(normalizedKey)) return null;

  const directMatch = FUZZY_ALIASES.find(
    (entry) => normalizeFieldKey(entry.alias) === normalizedKey,
  );
  if (directMatch) return buildFuzzyMatch(directMatch.field, profile);

  if (isPhoneLikeNonEmailLabel(normalizedKey)) return null;

  const result = FUZZY_MATCHER.search(normalizedKey)[0];
  if (!result || result.score === undefined || result.score > FUZZY_THRESHOLD) return null;

  return buildFuzzyMatch(result.item.field, profile);
}
