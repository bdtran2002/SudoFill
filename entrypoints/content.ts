import type {
  AutofillContentRequest,
  AutofillContentResponse,
  GeneratedProfile,
} from '../src/features/autofill/types';
import { prioritizeDobValues, resolveAutofillMatch } from '../src/features/autofill/matching';

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

function getAssociatedForm(element: Element) {
  return isFillableElement(element) ? element.form : null;
}

function getActiveForm() {
  const activeElement = document.activeElement;
  return activeElement ? getAssociatedForm(activeElement) : null;
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

function isReadonlyElement(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element.readOnly
    : false;
}

function isVisibleFillableElement(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
  if (element.hidden) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  return element.getClientRects().length > 0 || style.position === 'fixed';
}

function getElementContext(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const placeholder =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.placeholder
      : '';

  return {
    inputType: element instanceof HTMLInputElement ? element.type : undefined,
    placeholder,
    labelText: element.labels
      ? [...element.labels].map((label) => label.textContent ?? '').join(' ')
      : '',
    keyText: buildFieldKey(element),
  };
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

function prioritizeValuesForElement(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  field: keyof GeneratedProfile,
  values: string[],
) {
  if (field !== 'birthDateIso') return values;
  return prioritizeDobValues(values, getElementContext(element));
}

function fillProfile(profile: GeneratedProfile): AutofillContentResponse {
  const elements = [...document.querySelectorAll('input, select, textarea')].filter(
    isFillableElement,
  );
  const activeForm = getActiveForm();
  const prioritizedElements = elements
    .filter((element) => isVisibleFillableElement(element) && !isReadonlyElement(element))
    .sort((left, right) => {
      const leftPriority = activeForm && left.form === activeForm ? 0 : 1;
      const rightPriority = activeForm && right.form === activeForm ? 0 : 1;
      return leftPriority - rightPriority;
    });
  const filledFields = new Set<string>();
  let filledCount = 0;

  for (const element of prioritizedElements) {
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

    const didFill = assignValue(
      element,
      prioritizeValuesForElement(element, match.field, match.values.filter(Boolean)),
    );
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
