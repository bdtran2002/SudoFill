import type {
  AutofillContentRequest,
  AutofillContentResponse,
  GeneratedProfile,
} from '../src/features/autofill/types';

function isGeneratedProfile(value: unknown): value is GeneratedProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Record<string, unknown>;

  return [
    'firstName',
    'lastName',
    'fullName',
    'email',
    'phone',
    'sex',
    'birthDateIso',
    'birthDay',
    'birthMonth',
    'birthYear',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'stateName',
    'postalCode',
  ].every((key) => typeof profile[key] === 'string');
}

function isFillableElement(
  element: Element,
): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  );
}

function buildFieldKey(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const placeholder =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.placeholder
      : '';

  return [
    element.name,
    element.id,
    element.autocomplete,
    element.getAttribute('aria-label') ?? '',
    placeholder,
    element.labels ? [...element.labels].map((label) => label.textContent ?? '').join(' ') : '',
  ]
    .join(' ')
    .trim()
    .toLowerCase();
}

function hasExistingUserValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  return element.value.trim().length > 0;
}

function assignValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  values: string[],
) {
  if (element instanceof HTMLSelectElement) {
    const matchingOption = values
      .map((value) => value.trim().toLowerCase())
      .find((candidate) =>
        [...element.options].some((option) => {
          const optionValue = option.value.trim().toLowerCase();
          const optionLabel = option.text.trim().toLowerCase();
          return optionValue === candidate || optionLabel === candidate;
        }),
      );

    if (matchingOption) {
      const option = [...element.options].find((nextOption) => {
        const optionValue = nextOption.value.trim().toLowerCase();
        const optionLabel = nextOption.text.trim().toLowerCase();
        return optionValue === matchingOption || optionLabel === matchingOption;
      });

      if (!option) {
        return false;
      }

      element.value = option.value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    return false;
  }

  const prototype = Object.getPrototypeOf(element) as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (!descriptor?.set) {
    return false;
  }

  descriptor?.set?.call(element, values[0] ?? '');
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function resolveValueForField(key: string, profile: GeneratedProfile) {
  if (/(^|\b)(first|given).*name/.test(key))
    return { field: 'firstName', values: [profile.firstName] };
  if (/(^|\b)(last|family|surname).*name/.test(key))
    return { field: 'lastName', values: [profile.lastName] };
  if (/(full name|your name|name)/.test(key) && !/(user(name)?|company|last|first)/.test(key)) {
    return { field: 'fullName', values: [profile.fullName] };
  }
  if (/(email|e-mail)/.test(key)) return { field: 'email', values: [profile.email] };
  if (/(phone|mobile|tel)/.test(key)) return { field: 'phone', values: [profile.phone] };
  if (/(address line 1|street|address1|address$|mailing address)/.test(key)) {
    return { field: 'addressLine1', values: [profile.addressLine1] };
  }
  if (/(address line 2|address2|apartment|suite|unit)/.test(key)) {
    return { field: 'addressLine2', values: [profile.addressLine2] };
  }
  if (/(city|town)/.test(key)) return { field: 'city', values: [profile.city] };
  if (/(state|province|region)/.test(key)) {
    return { field: 'state', values: [profile.state, profile.stateName] };
  }
  if (/(zip|postal)/.test(key)) return { field: 'postalCode', values: [profile.postalCode] };
  if (/(dob|birth date|date of birth)/.test(key)) {
    return { field: 'birthDateIso', values: [profile.birthDateIso] };
  }
  if (/(birth month|dob month)/.test(key))
    return { field: 'birthMonth', values: [profile.birthMonth] };
  if (/(birth day|dob day)/.test(key)) return { field: 'birthDay', values: [profile.birthDay] };
  if (/(birth year|dob year)/.test(key)) return { field: 'birthYear', values: [profile.birthYear] };
  if (/(sex|gender)/.test(key)) return { field: 'sex', values: [profile.sex] };

  return null;
}

function fillProfile(profile: GeneratedProfile): AutofillContentResponse {
  const elements = [...document.querySelectorAll('input, select, textarea')].filter(
    isFillableElement,
  );
  const filledFields = new Set<string>();
  let filledCount = 0;

  for (const element of elements) {
    if (element.disabled) continue;
    if (
      element instanceof HTMLInputElement &&
      ['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(element.type)
    ) {
      continue;
    }
    if (hasExistingUserValue(element)) continue;

    const match = resolveValueForField(buildFieldKey(element), profile);
    if (!match) continue;
    if (!match.values.some(Boolean)) continue;

    const didFill = assignValue(element, match.values.filter(Boolean));
    if (!didFill) continue;

    filledCount += 1;
    filledFields.add(match.field);
  }

  return {
    ok: filledCount > 0,
    filledCount,
    fields: [...filledFields],
    error: filledCount > 0 ? undefined : 'No supported fields found on this page.',
  };
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    chrome.runtime.onMessage.addListener(
      (
        message: AutofillContentRequest,
        _sender,
        sendResponse: (response: AutofillContentResponse) => void,
      ) => {
        if (message.type !== 'autofill:fill-profile') {
          return false;
        }

        if (!isGeneratedProfile(message.profile)) {
          sendResponse({
            ok: false,
            filledCount: 0,
            fields: [],
            error: 'Malformed autofill profile payload.',
          });
          return true;
        }

        try {
          sendResponse(fillProfile(message.profile));
        } catch (error) {
          sendResponse({
            ok: false,
            filledCount: 0,
            fields: [],
            error: error instanceof Error ? error.message : 'Autofill failed on this page.',
          });
        }
        return true;
      },
    );
  },
});
