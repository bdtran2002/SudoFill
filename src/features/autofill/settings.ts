import {
  AUTOFILL_SETTINGS_STORAGE_KEY,
  DEFAULT_AUTOFILL_SETTINGS,
  US_STATE_OPTIONS,
} from './constants';
import type { AutofillSettings } from './types';

export function normalizeAutofillSettings(
  value: Partial<AutofillSettings> | null | undefined,
): AutofillSettings {
  return {
    ...DEFAULT_AUTOFILL_SETTINGS,
    ...value,
    generateAddress: value?.generateAddress ?? DEFAULT_AUTOFILL_SETTINGS.generateAddress,
    state: value?.state ?? DEFAULT_AUTOFILL_SETTINGS.state,
    sex: value?.sex ?? DEFAULT_AUTOFILL_SETTINGS.sex,
    ageMin: value?.ageMin ?? DEFAULT_AUTOFILL_SETTINGS.ageMin,
    ageMax: value?.ageMax ?? DEFAULT_AUTOFILL_SETTINGS.ageMax,
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
  return chrome.storage.sync.set({ [AUTOFILL_SETTINGS_STORAGE_KEY]: settings });
}

export function getStateName(stateCode: string) {
  return US_STATE_OPTIONS.find((state) => state.code === stateCode)?.name ?? '';
}
