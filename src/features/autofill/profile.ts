import { faker } from '@faker-js/faker';

import { US_STATE_OPTIONS } from './constants';
import { getStateName } from './settings';
import type { AutofillSettings, GeneratedProfile } from './types';

interface GenerateAutofillProfileOptions {
  email?: string | null;
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
  const min = settings.ageMin ? Number(settings.ageMin) : 18;
  const max = settings.ageMax ? Number(settings.ageMax) : Math.max(min, 72);

  return faker.date.birthdate({
    mode: 'age',
    min,
    max: Math.max(min, max),
  });
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
  const state = pickStateCode(settings.state);
  const stateName = getStateName(state);
  const addressLine1 = settings.generateAddress ? faker.location.streetAddress() : '';

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: options.email?.trim() || faker.internet.email({ firstName, lastName }).toLowerCase(),
    phone: faker.phone.number({ style: 'national' }),
    sex,
    birthDateIso: birthDate.toISOString().slice(0, 10),
    birthDay: String(birthDate.getDate()).padStart(2, '0'),
    birthMonth: String(birthDate.getMonth() + 1).padStart(2, '0'),
    birthYear: String(birthDate.getFullYear()),
    addressLine1,
    addressLine2: settings.generateAddress ? faker.location.secondaryAddress() : '',
    city: settings.generateAddress ? faker.location.city() : '',
    state,
    stateName,
    postalCode: settings.generateAddress ? faker.location.zipCode() : '',
  };
}
