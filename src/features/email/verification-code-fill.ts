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

function getAssociatedLabelText(element: HTMLInputElement | HTMLTextAreaElement) {
  return element.labels ? [...element.labels].map((label) => label.textContent ?? '').join(' ') : '';
}

function getFieldDescriptorText(element: HTMLInputElement | HTMLTextAreaElement) {
  return [
    element.name,
    element.id,
    element.placeholder,
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('autocomplete') ?? '',
    element.getAttribute('inputmode') ?? '',
    getReferencedText(element, 'aria-labelledby'),
    getReferencedText(element, 'aria-describedby'),
    getAssociatedLabelText(element),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNormalizedFieldDescriptorText(element: HTMLInputElement | HTMLTextAreaElement) {
  return getFieldDescriptorText(element).toLowerCase();
}

function getReferencedGroupText(element: Element) {
  const group = element.closest('fieldset, [role="group"], [aria-label], [aria-labelledby]');
  if (!group) return '';

  return [
    group.getAttribute('aria-label') ?? '',
    getReferencedText(group, 'aria-labelledby' as const),
    group.textContent ?? '',
  ]
    .join(' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNearbyVerificationContextText(element: HTMLInputElement | HTMLTextAreaElement) {
  return [getReferencedGroupText(element), element.parentElement?.textContent ?? '']
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isLikelyVerificationCodeField(element: HTMLInputElement | HTMLTextAreaElement) {
  const descriptorText = getNormalizedFieldDescriptorText(element);
  const nearbyText = getNearbyVerificationContextText(element);
  const autocomplete = element.getAttribute('autocomplete')?.toLowerCase() ?? '';

  if (autocomplete === 'one-time-code') return true;

  const strongPhrases = [
    'verification code',
    'security code',
    'one-time code',
    'one time code',
    'sign-in code',
    'signin code',
    'login code',
    'passcode',
    'otp',
    '2fa code',
    'mfa code',
    'auth code',
    'authentication code',
    'verification token',
    'security token',
  ];

  return strongPhrases.some((phrase) => descriptorText.includes(phrase) || nearbyText.includes(phrase));
}

function getValueSetter(element: HTMLInputElement | HTMLTextAreaElement) {
  let prototype = Object.getPrototypeOf(element);

  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) {
      return descriptor.set;
    }

    prototype = Object.getPrototypeOf(prototype);
  }

  return null;
}

export function scoreVerificationCodeField(
  element: HTMLInputElement | HTMLTextAreaElement,
) {
  if (!isLikelyVerificationCodeField(element)) return 0;

  let score = 0;
  const descriptorText = getNormalizedFieldDescriptorText(element);

  if (element === document.activeElement) score += 40;
  if (descriptorText.includes('verification') || descriptorText.includes('security')) score += 30;
  if (descriptorText.includes('one-time') || descriptorText.includes('one time')) score += 30;
  if (descriptorText.includes('sign-in') || descriptorText.includes('signin') || descriptorText.includes('login')) score += 20;
  if (descriptorText.includes('otp') || descriptorText.includes('passcode')) score += 20;
  if ((element.getAttribute('autocomplete') ?? '').toLowerCase() === 'one-time-code') score += 50;
  if (element instanceof HTMLInputElement && ['text', 'tel', 'number', 'search'].includes(element.type)) {
    score += 8;
  }
  if (element.value.trim().length === 0) score += 6;

  return score;
}

export function fillVerificationCode(code: string, doc: Document = document) {
  const activeElement = doc.activeElement;
  const candidates = [
    activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? activeElement
      : null,
    ...doc.querySelectorAll('input, textarea'),
  ].filter(Boolean) as Array<HTMLInputElement | HTMLTextAreaElement>;

  const target =
    candidates
      .filter((element) => !element.readOnly && !element.disabled)
      .sort(
        (left, right) =>
          scoreVerificationCodeField(right) - scoreVerificationCodeField(left),
      )[0] ?? null;

  if (!target || scoreVerificationCodeField(target) <= 0) return false;

  const valueSetter = getValueSetter(target);
  if (!valueSetter) return false;

  target.focus();
  valueSetter.call(target, code);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
