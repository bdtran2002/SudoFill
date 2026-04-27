import { faker } from '@faker-js/faker';

import { getAddressSampleForState } from './address-data';
import {
  DEFAULT_AUTOFILL_COUNTRY_CODE,
  DEFAULT_AUTOFILL_COUNTRY_NAME,
  getStateName,
  US_STATE_OPTIONS,
} from './constants';
import type { AutofillSettings, GeneratedProfile } from './types';

interface GenerateAutofillProfileOptions {
  email?: string | null;
}

const PASSWORD_CHARSETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnopqrstuvwxyz',
  number: '23456789',
  special: '!@#$%&*?-_+=',
} as const;

function getDateParts(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return {
    year,
    month,
    day,
    iso: `${year}-${month}-${day}`,
  };
}

function pickStateCode(preferredState: string) {
  if (preferredState) {
    return preferredState;
  }

  const availableStates = US_STATE_OPTIONS.filter((state) => state.code);
  return faker.helpers.arrayElement(availableStates).code;
}

function normalizeSex(settings: AutofillSettings): GeneratedProfile['sex'] {
  if (settings.sex === 'female' || settings.sex === 'male' || settings.sex === 'nonbinary') {
    return settings.sex;
  }

  return 'unspecified';
}

function resolveBirthdate(settings: AutofillSettings) {
  const minInput = settings.ageMin ? Number(settings.ageMin) : 18;
  const min = Number.isFinite(minInput) ? minInput : 18;
  const maxInput = settings.ageMax ? Number(settings.ageMax) : Math.max(min, 72);
  const max = Number.isFinite(maxInput) ? maxInput : Math.max(min, 72);

  return faker.date.birthdate({
    mode: 'age',
    min: Math.max(18, min),
    max: Math.max(min, max),
  });
}

function getAgeAtFill(birthDate: Date) {
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

function generateStrongPassword() {
  const randomIndex = (length: number) => {
    const limit = Math.floor(256 / length) * length;
    const bytes = new Uint8Array(1);

    do {
      globalThis.crypto.getRandomValues(bytes);
    } while (bytes[0] >= limit);

    return bytes[0] % length;
  };

  const pickRandomChar = (charset: string) => charset[randomIndex(charset.length)] ?? '';

  const required = [
    pickRandomChar(PASSWORD_CHARSETS.upper),
    pickRandomChar(PASSWORD_CHARSETS.lower),
    pickRandomChar(PASSWORD_CHARSETS.number),
    pickRandomChar(PASSWORD_CHARSETS.special),
  ];

  const alphabet = [
    ...PASSWORD_CHARSETS.upper,
    ...PASSWORD_CHARSETS.lower,
    ...PASSWORD_CHARSETS.number,
    ...PASSWORD_CHARSETS.special,
  ];

  const extraLength = 8 + randomIndex(5);
  const password = [
    ...required,
    ...Array.from({ length: extraLength }, () => pickRandomChar(alphabet.join(''))),
  ];

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex] ?? '', password[index] ?? ''];
  }

  return password.join('');
}

export function generateAutofillProfile(
  settings: AutofillSettings,
  options: GenerateAutofillProfileOptions = {},
): GeneratedProfile {
  const sex = normalizeSex(settings);
  const binarySex = sex === 'female' || sex === 'male' ? sex : undefined;
  const firstName = faker.person.firstName(binarySex);
  const lastName = faker.person.lastName(binarySex);
  const birthDate = resolveBirthdate(settings);
  const birthDateParts = getDateParts(birthDate);
  const ageAtFill = getAgeAtFill(birthDate);
  const state = settings.generateAddress ? pickStateCode(settings.state) : '';
  const stateName = settings.generateAddress && state ? getStateName(state) : '';
  const addressLine1 = settings.generateAddress ? faker.location.streetAddress() : '';
  const addressSample = state ? getAddressSampleForState(state) : null;
  const city = settings.generateAddress ? (addressSample?.city ?? faker.location.city()) : '';
  const postalCode = settings.generateAddress
    ? (addressSample?.postalCode ??
      (() => {
        if (state) {
          try {
            return faker.location.zipCode({ state: state as never });
          } catch {
            // fall through to generic zip generation
          }
        }

        return faker.location.zipCode();
      })())
    : '';

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    businessName: faker.company.name(),
    email: options.email?.trim() || faker.internet.email({ firstName, lastName }).toLowerCase(),
    phone: faker.phone.number({ style: 'national' }),
    password: settings.enablePasswordAutofill ? generateStrongPassword() : '',
    sex,
    birthDateIso: birthDateParts.iso,
    birthDay: birthDateParts.day,
    birthMonth: birthDateParts.month,
    birthYear: birthDateParts.year,
    ageAtFill,
    addressLine1,
    addressLine2: settings.generateAddress ? faker.location.secondaryAddress() : '',
    city,
    state,
    stateName,
    country: settings.generateAddress ? DEFAULT_AUTOFILL_COUNTRY_CODE : '',
    countryName: settings.generateAddress ? DEFAULT_AUTOFILL_COUNTRY_NAME : '',
    postalCode,
  };
}
