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
  codeCuePattern: RegExp,
) {
  let score = 0;
  const descriptorText = getFieldDescriptorText(element);

  if (element === document.activeElement) score += 40;
  if (codeCuePattern.test(descriptorText)) score += 30;
  if (element.getAttribute('autocomplete') === 'one-time-code') score += 50;
  if (element instanceof HTMLInputElement && ['text', 'tel', 'number', 'search'].includes(element.type)) {
    score += 8;
  }
  if (element.value.trim().length === 0) score += 6;

  return score;
}

export function fillVerificationCode(code: string, doc: Document = document) {
  const codeCuePattern =
    /(verification|security|sign[- ]?in|login|one[- ]?time|passcode|otp|auth|token|pin|code)/i;
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
          scoreVerificationCodeField(right, codeCuePattern) -
          scoreVerificationCodeField(left, codeCuePattern),
      )[0] ?? null;

  if (!target) return false;

  const valueSetter = getValueSetter(target);
  if (!valueSetter) return false;

  target.focus();
  valueSetter.call(target, code);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
