import { prioritizeDobValues, resolveAutofillMatch } from './matching';
import type { AutofillContentResponse, GeneratedProfile } from './types';

type FillableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const FILLABLE_SELECTOR = 'input, select, textarea';

const SIGN_UP_CUES = ['sign up', 'signup', 'create account', 'register', 'join', 'get started'];
const ACCOUNT_CUES = ['create profile', 'new customer', 'new account'];
const LOGIN_CUES = ['sign in', 'signin', 'log in', 'login'];
const EMAIL_FIRST_AUTH_SUBMIT_CUES = ['next', 'continue'];
const EMAIL_FIRST_AUTH_CONTEXT_CUES = [
  'stay logged in',
  'remember me',
  'keep me logged in',
  'keep me signed in',
];
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
  businessName: 6,
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

function normalizeLooseText(text: string | null | undefined) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeCueText(text: string | null | undefined) {
  return normalizeLooseText(text)
    .toLowerCase()
    .replace(/[-_/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyFieldLabelText(text: string) {
  const normalized = normalizeLooseText(text).toLowerCase();

  if (!normalized || normalized.length > 80) return false;

  return /(first|last|full|given|family|sur|mail|email|phone|mobile|birth|dob|date|day|month|year|gender|sex|address|city|state|province|country|zip|postal|name)/.test(
    normalized,
  );
}

function getStandaloneText(node: Node | null | undefined) {
  if (!node) return '';

  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeLooseText(node.textContent);
  }

  if (!(node instanceof Element)) return '';
  if (node.matches('input, select, textarea, button')) return '';
  if (node.querySelector('input, select, textarea, button')) return '';

  return normalizeLooseText(node.textContent);
}

function collectNearbyLabelText(container: Element | null, blockedNode: Node | null) {
  if (!container) return '';

  if (container.querySelectorAll('input, select, textarea').length > 1) {
    return '';
  }

  const parts = [...container.childNodes]
    .filter((node) => node !== blockedNode)
    .map((node) => getStandaloneText(node))
    .filter((text) => isLikelyFieldLabelText(text));

  return [...new Set(parts)].join(' ');
}

function getNearbyLabelText(element: FillableElement) {
  const parent = element.parentElement;
  const parts = [
    getStandaloneText(element.previousSibling as Node | null),
    getStandaloneText(element.previousElementSibling),
    collectNearbyLabelText(parent, element),
    collectNearbyLabelText(parent?.parentElement ?? null, parent),
    getStandaloneText(parent?.previousElementSibling ?? null),
  ].filter((text) => isLikelyFieldLabelText(text));

  return [...new Set(parts)].join(' ');
}

function getNearbyDobGroupingText(element: FillableElement) {
  const nameLike = [
    element instanceof HTMLInputElement ? element.name : '',
    element.id,
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('autocomplete') ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (!/(month|day|year)/.test(nameLike)) return '';

  const container = element.closest('div, li, section, article, fieldset');
  if (!container) return '';

  const text = [
    container.getAttribute('aria-label') ?? '',
    getReferencedText(container, 'aria-labelledby'),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return /birth|dob|date of birth|birthday/.test(text) ? text : '';
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
  const nearbyLabelText = getNearbyLabelText(element);
  const dobGroupingText = getNearbyDobGroupingText(element);

  return [
    element.name,
    element.id,
    element.autocomplete,
    element.getAttribute('aria-label') ?? '',
    labelledByText,
    describedByText,
    placeholder,
    getAssociatedLabelText(element),
    nearbyLabelText,
    legendText,
    dobGroupingText,
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

function queryFillableElements(doc: Document) {
  return [...doc.querySelectorAll(FILLABLE_SELECTOR)].filter(isFillableElement);
}

function getVisibleEditableFillableElements(doc: Document) {
  return queryFillableElements(doc).filter(
    (element) => isVisibleFillableElement(element, doc) && !isReadonlyElement(element),
  );
}

function getElementContext(element: FillableElement) {
  const placeholder =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.placeholder
      : '';
  const labelledByText = getReferencedText(element, 'aria-labelledby');
  const legendText = getFieldsetLegendText(element);
  const nearbyLabelText = getNearbyLabelText(element);
  const dobGroupingText = getNearbyDobGroupingText(element);

  return {
    inputType: element instanceof HTMLInputElement ? element.type : undefined,
    placeholder,
    labelText: [
      getAssociatedLabelText(element),
      nearbyLabelText,
      labelledByText,
      legendText,
      dobGroupingText,
    ]
      .join(' ')
      .trim(),
    keyText: buildFieldKey(element),
  };
}

function getFieldMatch(element: FillableElement, profile: GeneratedProfile) {
  if (element.disabled) return null;
  if (
    element instanceof HTMLInputElement &&
    ['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(element.type)
  ) {
    return null;
  }
  if (hasExistingUserValue(element)) return null;

  const match = resolveAutofillMatch(buildFieldKey(element), profile);
  return match?.values.some(Boolean) ? match : null;
}

function getScopeMatchSummary(elements: FillableElement[], profile: GeneratedProfile) {
  const matchedFields = new Map<keyof GeneratedProfile, number>();
  let matchingFieldCount = 0;

  for (const element of elements) {
    const match = getFieldMatch(element, profile);
    if (!match) continue;

    matchingFieldCount += 1;
    matchedFields.set(match.field, FIELD_WEIGHTS[match.field] ?? 1);
  }

  return { matchedFields, matchingFieldCount };
}

type ScopeAnalysis = {
  root: HTMLElement | null;
  elements: FillableElement[];
  text: string;
  matchedFields: Map<keyof GeneratedProfile, number>;
  matchingFieldCount: number;
  hasPassword: boolean;
  hasSubmit: boolean;
  hasLowIntentCue: boolean;
  hasExplicitSignupCue: boolean;
  hasNonSignupAccountCue: boolean;
  identityFieldCount: number;
  emailFirstAuthFlow: boolean;
  strongSignupIntent: boolean;
  richIdentityScope: boolean;
};

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

  return normalizeCueText(
    [
      root.getAttribute('aria-label') ?? '',
      getReferencedText(root, 'aria-labelledby'),
      root.id,
      root.getAttribute('name') ?? '',
      root.matches('fieldset') ? (root.querySelector('legend')?.textContent ?? '') : '',
      root.textContent ?? '',
    ].join(' '),
  );
}

function getDocumentIntentText(doc: Document) {
  return normalizeCueText([doc.title, doc.location?.pathname ?? ''].join(' '));
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

function getSubmitControlText(root: HTMLElement | null) {
  if (!root) return '';

  return normalizeCueText(
    [
      ...root.querySelectorAll(
        'button[type="submit"], input[type="submit"], input[type="button"], button:not([type]), button[type="button"]',
      ),
    ]
      .map((control) =>
        control instanceof HTMLInputElement
          ? [control.value, control.getAttribute('aria-label') ?? ''].join(' ')
          : [control.textContent ?? '', control.getAttribute('aria-label') ?? ''].join(' '),
      )
      .join(' '),
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

function analyzeScope(
  root: HTMLElement | null,
  elements: FillableElement[],
  profile: GeneratedProfile,
  doc: Document,
) {
  const text = getScopeText(root);
  const { matchedFields, matchingFieldCount } = getScopeMatchSummary(elements, profile);
  const hasPassword = hasPasswordField(elements);
  const hasSubmit = hasSubmitControl(root);
  const hasLowIntentCue = hasCue(text, LOW_INTENT_CUES);
  const hasExplicitSignupCue = hasCue(text, [...SIGN_UP_CUES, ...ACCOUNT_CUES]);
  const hasNonSignupAccountCue = hasCue(text, NON_SIGNUP_ACCOUNT_CUES);
  const identityFieldCount = ['email', 'firstName', 'lastName', 'fullName'].filter((field) =>
    matchedFields.has(field as keyof GeneratedProfile),
  ).length;
  const authContextText = [text, getDocumentIntentText(doc)].filter(Boolean).join(' ');
  const submitText = getSubmitControlText(root);
  const hasAuthStepCue =
    hasCue(submitText, EMAIL_FIRST_AUTH_SUBMIT_CUES) || hasCue(text, EMAIL_FIRST_AUTH_CONTEXT_CUES);
  const emailFirstAuthFlow =
    Boolean(root) &&
    !hasPassword &&
    hasSubmit &&
    matchingFieldCount === 1 &&
    matchedFields.size === 1 &&
    matchedFields.has('email') &&
    hasCue(authContextText, LOGIN_CUES) &&
    hasAuthStepCue &&
    !hasNonSignupAccountCue &&
    !hasLowIntentCue;
  const strongSignupIntent =
    (hasExplicitSignupCue && !hasLowIntentCue) || (hasPassword && identityFieldCount >= 2);
  const richIdentityScope = identityFieldCount >= 3;

  return {
    root,
    elements,
    text,
    matchedFields,
    matchingFieldCount,
    hasPassword,
    hasSubmit,
    hasLowIntentCue,
    hasExplicitSignupCue,
    hasNonSignupAccountCue,
    identityFieldCount,
    emailFirstAuthFlow,
    strongSignupIntent,
    richIdentityScope,
  } satisfies ScopeAnalysis;
}

function scoreScope(analysis: ScopeAnalysis) {
  const {
    text,
    matchedFields,
    matchingFieldCount,
    identityFieldCount,
    emailFirstAuthFlow,
    hasLowIntentCue,
    hasExplicitSignupCue,
    strongSignupIntent,
    richIdentityScope,
    hasPassword,
  } = analysis;
  const uniqueFieldScore = [...matchedFields.values()].reduce((sum, value) => sum + value, 0);
  const totalMatchScore = matchingFieldCount * 2;

  let score = uniqueFieldScore + totalMatchScore;

  if (identityFieldCount >= 2) score += 6;
  if (richIdentityScope) score += 4;
  if (emailFirstAuthFlow) score += 4;
  if (hasExplicitSignupCue && !hasLowIntentCue) score += 8;
  if (hasCue(text, LOGIN_CUES) && !emailFirstAuthFlow) score -= 8;
  if (analysis.hasNonSignupAccountCue) score -= 10;
  if (matchedFields.size < 2 && !emailFirstAuthFlow) score -= 8;
  if (hasLowIntentCue && !strongSignupIntent) score -= 14;
  if (hasPassword && identityFieldCount >= 2) score += 3;
  if (!strongSignupIntent && identityFieldCount < 3 && !emailFirstAuthFlow) score -= 4;
  if (!strongSignupIntent && !analysis.hasSubmit && !emailFirstAuthFlow) score -= 4;

  return score;
}

function isEligibleScope(analysis: ScopeAnalysis) {
  // Password-bearing account flows need to stay eligible even when the page copy is sparse.
  const hasStrongSignupCue =
    analysis.strongSignupIntent ||
    analysis.hasPassword ||
    (analysis.matchingFieldCount >= 3 &&
      !analysis.hasNonSignupAccountCue &&
      !analysis.hasLowIntentCue);

  return (
    hasStrongSignupCue ||
    analysis.emailFirstAuthFlow ||
    (analysis.root === null && analysis.elements.length >= 3)
  );
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

function isElementInTargetScope(element: FillableElement, targetRoot: HTMLElement | null) {
  if (targetRoot) {
    return element.form === targetRoot || targetRoot.contains(element);
  }

  return element.form === null && getScopeRoot(element) === null;
}

function selectTargetScope(
  visibleElements: FillableElement[],
  profile: GeneratedProfile,
  doc: Document,
) {
  const activeForm = getActiveForm(doc);
  const activeScopeRoot = getActiveScopeRoot(doc);

  const scoredScopes = buildTargetScopes(visibleElements)
    .map((scope) => {
      const analysis = analyzeScope(scope.root, scope.elements, profile, doc);

      return {
        ...scope,
        analysis,
        score:
          scoreScope(analysis) +
          (activeForm && scope.root === activeForm ? 5 : 0) +
          (activeScopeRoot && scope.root === activeScopeRoot ? 3 : 0),
      };
    })
    .filter((candidate) => candidate.score > 0 && isEligibleScope(candidate.analysis))
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
  const targetRoot = selectTargetScope(getVisibleEditableFillableElements(doc), profile, doc);

  const filledFields = new Set<string>();
  let filledCount = 0;
  // Bounded rescans catch dependent selects like country -> state without turning
  // autofill into an open-ended DOM watcher.
  const maxPasses = 6;
  let shouldKeepRescanning = false;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const prioritizedElements = getVisibleEditableFillableElements(doc).filter((element) =>
      isElementInTargetScope(element, targetRoot),
    );

    let didFillAny = false;
    let didFillSelect = false;

    for (const element of prioritizedElements) {
      const match = getFieldMatch(element, profile);
      if (!match) continue;

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
  return selectTargetScope(getVisibleEditableFillableElements(doc), profile, doc);
}

export function getTargetFormForTesting(
  profile: GeneratedProfile,
  doc: Document = document,
): HTMLFormElement | null {
  const targetRoot = getTargetRootForTesting(profile, doc);
  return targetRoot instanceof HTMLFormElement ? targetRoot : null;
}
