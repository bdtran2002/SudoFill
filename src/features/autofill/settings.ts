import {
  AUTOFILL_SETTINGS_STORAGE_KEY,
  DEFAULT_AUTOFILL_SETTINGS,
  US_STATE_OPTIONS,
} from './constants';
import type { AutofillSettings } from './types';
import { callWebExtensionApi } from '../../lib/webext-async';

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

function normalizeStateValue(value: unknown) {
  const candidate = normalizeString(value, DEFAULT_AUTOFILL_SETTINGS.state);
  return VALID_STATE_CODES.has(candidate) ? candidate : DEFAULT_AUTOFILL_SETTINGS.state;
}

function normalizeSexValue(value: unknown): AutofillSettings['sex'] {
  const candidate =
    typeof value === 'string' ? normalizeString(value) : DEFAULT_AUTOFILL_SETTINGS.sex;
  return VALID_SEX_VALUES.has(candidate)
    ? (candidate as AutofillSettings['sex'])
    : DEFAULT_AUTOFILL_SETTINGS.sex;
}

function normalizeAgeRange(ageMinValue: unknown, ageMaxValue: unknown) {
  const ageMin = normalizeAgeValue(ageMinValue);
  const ageMax = normalizeAgeValue(ageMaxValue);

  return {
    ageMin,
    ageMax:
      ageMin && ageMax && Number(ageMin) > Number(ageMax)
        ? DEFAULT_AUTOFILL_SETTINGS.ageMax
        : ageMax,
  };
}

export function normalizeAutofillSettings(
  value: Partial<AutofillSettings> | null | undefined,
): AutofillSettings {
  const { ageMin, ageMax } = normalizeAgeRange(value?.ageMin, value?.ageMax);

  return {
    generateAddress: normalizeBoolean(
      value?.generateAddress,
      DEFAULT_AUTOFILL_SETTINGS.generateAddress,
    ),
    showVerificationAssistPopup: normalizeBoolean(
      value?.showVerificationAssistPopup,
      DEFAULT_AUTOFILL_SETTINGS.showVerificationAssistPopup,
    ),
    saveUsageHistory: normalizeBoolean(
      value?.saveUsageHistory,
      DEFAULT_AUTOFILL_SETTINGS.saveUsageHistory,
    ),
    state: normalizeStateValue(value?.state),
    sex: normalizeSexValue(value?.sex),
    ageMin,
    ageMax,
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
  return callWebExtensionApi<Record<string, Partial<AutofillSettings> | undefined>>(
    'storage',
    'sync.get',
    AUTOFILL_SETTINGS_STORAGE_KEY,
  ).then((result) =>
    normalizeAutofillSettings(
      result[AUTOFILL_SETTINGS_STORAGE_KEY] as Partial<AutofillSettings> | undefined,
    ),
  );
}

export function setStoredAutofillSettings(settings: AutofillSettings) {
  return callWebExtensionApi('storage', 'sync.set', {
    [AUTOFILL_SETTINGS_STORAGE_KEY]: normalizeAutofillSettings(settings),
  });
}
