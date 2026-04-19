import type { GeneratedProfile } from './types';

export type AutofillFieldMatch = {
  field: keyof GeneratedProfile;
  values: string[];
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

export function resolveAutofillMatch(
  key: string,
  profile: GeneratedProfile,
): AutofillFieldMatch | null {
  const normalizedKey = normalizeFieldKey(key);

  if (
    hasAnyToken(normalizedKey, ['given name', 'first name']) ||
    hasToken(normalizedKey, 'givenname') ||
    hasToken(normalizedKey, 'firstname')
  ) {
    return { field: 'firstName', values: [profile.firstName] };
  }

  if (
    hasAnyToken(normalizedKey, ['family name', 'last name', 'surname']) ||
    hasToken(normalizedKey, 'familyname') ||
    hasToken(normalizedKey, 'lastname')
  ) {
    return { field: 'lastName', values: [profile.lastName] };
  }

  if (hasAnyToken(normalizedKey, ['email', 'e mail']) || hasToken(normalizedKey, 'emailaddress'))
    return { field: 'email', values: [profile.email] };

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
  if (hasAnyToken(normalizedKey, ['state', 'province', 'region'])) {
    return { field: 'state', values: [profile.state, profile.stateName] };
  }
  if (hasAnyToken(normalizedKey, ['zip', 'postal']) || hasToken(normalizedKey, 'postalcode'))
    return { field: 'postalCode', values: [profile.postalCode] };

  if (isSplitDobField(normalizedKey) && hasDobPartToken(normalizedKey, 'month')) {
    return {
      field: 'birthMonth',
      values: [
        profile.birthMonth,
        String(Number(profile.birthMonth)),
        monthName(profile.birthMonth),
        shortMonthName(profile.birthMonth),
      ].filter((value): value is string => Boolean(value)),
    };
  }
  if (isSplitDobField(normalizedKey) && hasDobPartToken(normalizedKey, 'day')) {
    return { field: 'birthDay', values: [profile.birthDay] };
  }
  if (isSplitDobField(normalizedKey) && hasDobPartToken(normalizedKey, 'year')) {
    return { field: 'birthYear', values: [profile.birthYear] };
  }

  if (
    hasAnyToken(normalizedKey, ['birthday', 'dob', 'birth date', 'date of birth']) ||
    hasToken(normalizedKey, 'birthdate')
  ) {
    return { field: 'birthDateIso', values: dobValues(profile) };
  }

  if (hasAnyToken(normalizedKey, ['sex', 'gender'])) return { field: 'sex', values: [profile.sex] };

  if (isObviousNameFallback(normalizedKey)) {
    return { field: 'fullName', values: [profile.fullName] };
  }

  return null;
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
  if (!hasToken(key, 'name')) return false;
  return !hasAnyToken(key, ['username', 'user name', 'company', 'middle', 'preferred', 'display']);
}
