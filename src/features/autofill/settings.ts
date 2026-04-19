import {
  AUTOFILL_SETTINGS_STORAGE_KEY,
  DEFAULT_AUTOFILL_SETTINGS,
  US_STATE_OPTIONS,
} from './constants';
import type { AutofillSettings } from './types';

const VALID_STATE_CODES = new Set<string>(US_STATE_OPTIONS.map((state) => state.code));
const VALID_SEX_VALUES = new Set(['', 'female', 'male', 'nonbinary']);

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeAgeValue(value: unknown) {
  const normalized = normalizeString(value).trim();

  if (!normalized) {
    return '';
  }

  if (!/^\d+$/.test(normalized)) {
    return '';
  }

  const numeric = Number(normalized);

  if (!Number.isInteger(numeric) || numeric < 18 || numeric > 99) {
    return '';
  }

  return String(numeric);
}

export function normalizeAutofillSettings(
  value: Partial<AutofillSettings> | null | undefined,
): AutofillSettings {
  const state = normalizeString(value?.state);
  const ageMin = normalizeAgeValue(value?.ageMin);
  const ageMax = normalizeAgeValue(value?.ageMax);

  return {
    generateAddress: normalizeBoolean(
      value?.generateAddress,
      DEFAULT_AUTOFILL_SETTINGS.generateAddress,
    ),
    state: VALID_STATE_CODES.has(state) ? state : DEFAULT_AUTOFILL_SETTINGS.state,
    sex: VALID_SEX_VALUES.has(value?.sex ?? '')
      ? (value?.sex as AutofillSettings['sex'])
      : DEFAULT_AUTOFILL_SETTINGS.sex,
    ageMin,
    ageMax:
      ageMin && ageMax && Number(ageMin) > Number(ageMax)
        ? DEFAULT_AUTOFILL_SETTINGS.ageMax
        : ageMax,
  };
}

export function isAutofillAgeRangeValid(settings: AutofillSettings) {
  if (!settings.ageMin && !settings.ageMax) return true;

  const min = settings.ageMin ? Number(settings.ageMin) : undefined;
  const max = settings.ageMax ? Number(settings.ageMax) : undefined;

  if (
    (min !== undefined && !Number.isInteger(min)) ||
    (max !== undefined && !Number.isInteger(max))
  ) {
    return false;
  }

  if (min !== undefined && (min < 18 || min > 99)) return false;
  if (max !== undefined && (max < 18 || max > 99)) return false;
  if (min !== undefined && max !== undefined && min > max) return false;

  return true;
}

export function getStoredAutofillSettings() {
  return chrome.storage.sync
    .get(AUTOFILL_SETTINGS_STORAGE_KEY)
    .then((result) =>
      normalizeAutofillSettings(
        result[AUTOFILL_SETTINGS_STORAGE_KEY] as Partial<AutofillSettings> | undefined,
      ),
    );
}

export function setStoredAutofillSettings(settings: AutofillSettings) {
  return chrome.storage.sync.set({
    [AUTOFILL_SETTINGS_STORAGE_KEY]: normalizeAutofillSettings(settings),
  });
}

export function getStateName(stateCode: string) {
  return US_STATE_OPTIONS.find((state) => state.code === stateCode)?.name ?? '';
}
