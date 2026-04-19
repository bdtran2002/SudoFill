import { prioritizeDobValues, resolveAutofillMatch } from './matching';
import type { AutofillContentResponse, GeneratedProfile } from './types';

type FillableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const SIGN_UP_CUES = ['sign up', 'signup', 'create account', 'register', 'join', 'get started'];
const ACCOUNT_CUES = ['create profile', 'new customer', 'new account'];
const LOGIN_CUES = ['sign in', 'signin', 'log in', 'login'];
const NON_SIGNUP_ACCOUNT_CUES = [
  'my account',
  'account details',
  'profile',
  'settings',
  'preferences',
];
const LOW_INTENT_CUES = [
  'search',
  'subscribe',
  'newsletter',
  'contact us',
  'contact sales',
  'support',
  'checkout',
  'shipping',
  'billing',
  'payment',
  'delivery',
  'request demo',
  'request a demo',
  'book demo',
  'book a demo',
  'schedule demo',
  'schedule a demo',
  'talk to sales',
  'speak to sales',
  'sales demo',
  'request pricing',
];

const FIELD_WEIGHTS: Partial<Record<keyof GeneratedProfile, number>> = {
  email: 8,
  fullName: 7,
  firstName: 5,
  lastName: 5,
  birthDateIso: 3,
  birthDay: 2,
  birthMonth: 2,
  birthYear: 2,
  sex: 1,
  addressLine1: 2,
  addressLine2: 1,
  city: 2,
  country: 2,
  state: 2,
  postalCode: 2,
};

export function isFillableElement(element: Element): element is FillableElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  );
}

function getAssociatedForm(element: Element) {
  return isFillableElement(element) ? element.form : null;
}

function getActiveForm(doc: Document) {
  const activeElement = doc.activeElement;
  return activeElement ? getAssociatedForm(activeElement) : null;
}

function getReferencedText(element: Element, attribute: 'aria-labelledby' | 'aria-describedby') {
  const ids = element
    .getAttribute(attribute)
    ?.split(/\s+/)
    .map((id) => id.trim())
    .filter(Boolean);

  if (!ids?.length) return '';

  return ids
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

function getFieldsetLegendText(element: Element) {
  const fieldset = element.closest('fieldset');
  return fieldset?.querySelector('legend')?.textContent?.trim() ?? '';
}

function getAssociatedLabelText(element: FillableElement) {
  return element.labels
    ? [...element.labels].map((label) => label.textContent ?? '').join(' ')
    : '';
}

export function buildFieldKey(element: FillableElement) {
  const placeholder =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.placeholder
      : '';
  const labelledByText = getReferencedText(element, 'aria-labelledby');
  const describedByText = getReferencedText(element, 'aria-describedby');
  const legendText = getFieldsetLegendText(element);

  return [
    element.name,
    element.id,
    element.autocomplete,
    element.getAttribute('aria-label') ?? '',
    labelledByText,
    describedByText,
    placeholder,
    getAssociatedLabelText(element),
    legendText,
  ]
    .join(' ')
    .trim()
    .toLowerCase();
}

export function hasExistingUserValue(element: FillableElement) {
  return element.value.trim().length > 0;
}

export function isReadonlyElement(element: FillableElement) {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element.readOnly
    : false;
}

export function isVisibleFillableElement(element: FillableElement, doc = document) {
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
  if (element.hidden) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const view = doc.defaultView ?? window;
  const style = view.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  return element.getClientRects().length > 0 || style.position === 'fixed';
}

function getElementContext(element: FillableElement) {
  const placeholder =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.placeholder
      : '';
  const labelledByText = getReferencedText(element, 'aria-labelledby');
  const legendText = getFieldsetLegendText(element);

  return {
    inputType: element instanceof HTMLInputElement ? element.type : undefined,
    placeholder,
    labelText: [getAssociatedLabelText(element), labelledByText, legendText].join(' ').trim(),
    keyText: buildFieldKey(element),
  };
}

function assignValue(element: FillableElement, values: string[]) {
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

  descriptor.set.call(element, values[0] ?? '');
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function prioritizeValuesForElement(
  element: FillableElement,
  field: keyof GeneratedProfile,
  values: string[],
) {
  if (field !== 'birthDateIso') return values;
  return prioritizeDobValues(values, getElementContext(element));
}

function getScopeText(root: HTMLElement | null) {
  if (!root) return '';

  return [
    root.getAttribute('aria-label') ?? '',
    getReferencedText(root, 'aria-labelledby'),
    root.id,
    root.getAttribute('name') ?? '',
    root.matches('fieldset') ? (root.querySelector('legend')?.textContent ?? '') : '',
    root.textContent ?? '',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasCue(text: string, cues: string[]) {
  return cues.some((cue) => text.includes(cue));
}

function hasPasswordField(elements: FillableElement[]) {
  return elements.some(
    (element) => element instanceof HTMLInputElement && element.type === 'password',
  );
}

function hasSubmitControl(root: HTMLElement | null) {
  if (!root) return false;

  return Boolean(
    root.querySelector(
      'button[type="submit"], input[type="submit"], button:not([type]), button[type="button"]',
    ),
  );
}

function countContainedFillables(root: HTMLElement) {
  return root.querySelectorAll('input, select, textarea').length;
}

function getScopeRoot(element: HTMLElement) {
  let fallbackRoot: HTMLElement | null = null;

  for (let current = element.parentElement; current; current = current.parentElement) {
    if (current === document.body) break;

    const text = getScopeText(current);
    const hasEnoughFields = countContainedFillables(current) >= 2;

    if (!hasEnoughFields) continue;
    fallbackRoot ??= current;

    if (current.matches('form, [role="form"], fieldset, section, article, main')) {
      return current;
    }

    if (
      current.matches('div') &&
      (hasSubmitControl(current) ||
        hasCue(text, SIGN_UP_CUES) ||
        hasCue(text, ACCOUNT_CUES) ||
        hasCue(text, LOW_INTENT_CUES))
    ) {
      return current;
    }
  }

  return fallbackRoot;
}

function getActiveScopeRoot(doc: Document) {
  const activeElement = doc.activeElement;
  if (!(activeElement instanceof HTMLElement)) return null;

  return getScopeRoot(activeElement);
}

function getMatchingFieldCount(elements: FillableElement[], profile: GeneratedProfile) {
  return elements.reduce((count, element) => {
    if (element.disabled) return count;
    if (
      element instanceof HTMLInputElement &&
      ['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(element.type)
    ) {
      return count;
    }
    if (hasExistingUserValue(element)) return count;

    const match = resolveAutofillMatch(buildFieldKey(element), profile);
    return match?.values.some(Boolean) ? count + 1 : count;
  }, 0);
}

function scoreScope(
  root: HTMLElement | null,
  elements: FillableElement[],
  profile: GeneratedProfile,
) {
  const text = getScopeText(root);
  const matchedFields = new Map<keyof GeneratedProfile, number>();

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
    if (!match?.values.some(Boolean)) continue;

    matchedFields.set(match.field, FIELD_WEIGHTS[match.field] ?? 1);
  }

  const uniqueFieldScore = [...matchedFields.values()].reduce((sum, value) => sum + value, 0);
  const totalMatchScore = getMatchingFieldCount(elements, profile) * 2;
  const identityFieldCount = ['email', 'firstName', 'lastName', 'fullName'].filter((field) =>
    matchedFields.has(field as keyof GeneratedProfile),
  ).length;
  const strongSignupIntent =
    hasCue(text, [...SIGN_UP_CUES, ...ACCOUNT_CUES]) ||
    (hasPasswordField(elements) && identityFieldCount >= 2);
  const richIdentityScope = identityFieldCount >= 3;

  let score = uniqueFieldScore + totalMatchScore;

  if (identityFieldCount >= 2) score += 6;
  if (richIdentityScope) score += 4;
  if (hasCue(text, [...SIGN_UP_CUES, ...ACCOUNT_CUES])) score += 8;
  if (hasCue(text, LOGIN_CUES)) score -= 8;
  if (hasCue(text, NON_SIGNUP_ACCOUNT_CUES)) score -= 10;
  if (matchedFields.size < 2) score -= 8;
  if (hasCue(text, LOW_INTENT_CUES) && !strongSignupIntent) score -= 14;
  if (hasPasswordField(elements) && identityFieldCount >= 2) score += 3;
  if (!strongSignupIntent && identityFieldCount < 3) score -= 4;
  if (!strongSignupIntent && !hasSubmitControl(root)) score -= 4;

  return score;
}

function isEligibleScope(
  root: HTMLElement | null,
  elements: FillableElement[],
  profile: GeneratedProfile,
) {
  const text = getScopeText(root);
  const matchingFieldCount = getMatchingFieldCount(elements, profile);
  const hasNonSignupAccountCue = hasCue(text, NON_SIGNUP_ACCOUNT_CUES);
  const hasLowIntentCue = hasCue(text, LOW_INTENT_CUES);
  const hasStrongSignupCue =
    hasCue(text, [...SIGN_UP_CUES, ...ACCOUNT_CUES]) ||
    hasPasswordField(elements) ||
    (matchingFieldCount >= 3 && !hasNonSignupAccountCue && !hasLowIntentCue);

  return hasStrongSignupCue || (root === null && elements.length >= 3);
}

function buildTargetScopes(visibleElements: FillableElement[]) {
  const scopes = new Map<HTMLElement | null, FillableElement[]>();

  for (const element of visibleElements) {
    const root = element.form ?? getScopeRoot(element);
    const group = scopes.get(root);
    if (group) group.push(element);
    else scopes.set(root, [element]);
  }

  return [...scopes.entries()].map(([root, elements]) => ({ root, elements }));
}

function selectTargetScope(
  visibleElements: FillableElement[],
  profile: GeneratedProfile,
  doc: Document,
) {
  const activeForm = getActiveForm(doc);
  const activeScopeRoot = getActiveScopeRoot(doc);

  const scoredScopes = buildTargetScopes(visibleElements)
    .map((scope) => ({
      ...scope,
      score:
        scoreScope(scope.root, scope.elements, profile) +
        (activeForm && scope.root === activeForm ? 5 : 0) +
        (activeScopeRoot && scope.root === activeScopeRoot ? 3 : 0),
    }))
    .filter(
      (candidate) =>
        candidate.score > 0 && isEligibleScope(candidate.root, candidate.elements, profile),
    )
    .sort((left, right) => right.score - left.score);

  return scoredScopes[0]?.root ?? null;
}

async function yieldToNextTick() {
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
}

export async function fillProfile(
  profile: GeneratedProfile,
  doc: Document = document,
): Promise<AutofillContentResponse> {
  const targetRoot = selectTargetScope(
    [...doc.querySelectorAll('input, select, textarea')]
      .filter(isFillableElement)
      .filter((element) => isVisibleFillableElement(element, doc) && !isReadonlyElement(element)),
    profile,
    doc,
  );

  const filledFields = new Set<string>();
  let filledCount = 0;
  // Bounded rescans catch dependent selects like country -> state without turning
  // autofill into an open-ended DOM watcher.
  const maxPasses = 6;
  let shouldKeepRescanning = false;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const elements = [...doc.querySelectorAll('input, select, textarea')].filter(isFillableElement);
    const visibleElements = elements.filter(
      (element) => isVisibleFillableElement(element, doc) && !isReadonlyElement(element),
    );

    const prioritizedElements = visibleElements.filter((element) => {
      if (targetRoot) {
        return element.form === targetRoot || targetRoot.contains(element);
      }

      return element.form === null && getScopeRoot(element) === null;
    });

    let didFillAny = false;
    let didFillSelect = false;

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
      didFillAny = true;
      if (element instanceof HTMLSelectElement) {
        didFillSelect = true;
      }
    }

    shouldKeepRescanning ||= didFillSelect;

    if (!didFillAny && !shouldKeepRescanning) break;

    if (pass < maxPasses - 1) {
      if (didFillSelect || shouldKeepRescanning) {
        await yieldToNextTick();
      }
    }
  }

  return {
    ok: filledCount > 0,
    filledCount,
    fields: [...filledFields],
    error: filledCount > 0 ? undefined : 'No supported fields found on this page.',
    reason: filledCount > 0 ? undefined : 'no-fields',
  };
}

export function getTargetRootForTesting(
  profile: GeneratedProfile,
  doc: Document = document,
): HTMLElement | null {
  const elements = [...doc.querySelectorAll('input, select, textarea')].filter(isFillableElement);
  const visibleElements = elements.filter(
    (element) => isVisibleFillableElement(element, doc) && !isReadonlyElement(element),
  );

  return selectTargetScope(visibleElements, profile, doc);
}

export function getTargetFormForTesting(
  profile: GeneratedProfile,
  doc: Document = document,
): HTMLFormElement | null {
  const targetRoot = getTargetRootForTesting(profile, doc);
  return targetRoot instanceof HTMLFormElement ? targetRoot : null;
}
