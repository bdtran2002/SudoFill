import type {
  AutofillContentRequest,
  AutofillContentResponse,
  GeneratedProfile,
} from '../src/features/autofill/types';
import { resolveAutofillMatch } from '../src/features/autofill/matching';

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

    const match = resolveAutofillMatch(buildFieldKey(element), profile);
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
