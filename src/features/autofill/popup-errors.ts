import type { AutofillContentResponse, AutofillFailureReason } from './types';

const UNSUPPORTED_PROTOCOLS = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'moz-extension:'];

const UNSUPPORTED_PAGE_ERROR = 'Autofill is not available on this page yet.';
const NO_FIELDS_ERROR = 'No supported fields found on this page.';
const INVALID_RESPONSE_ERROR = 'Autofill could not confirm whether the page was filled.';
const VALID_FAILURE_REASONS = new Set<AutofillFailureReason>(['no-fields', 'payload', 'runtime']);

function hasUnsupportedProtocol(url?: string) {
  if (!url) return false;
  return UNSUPPORTED_PROTOCOLS.some((protocol) => url.startsWith(protocol));
}

function isUnsupportedPageTransportMessage(message: string) {
  return [
    'could not establish connection',
    'receiving end does not exist',
    'no matching message listener',
    'extension context invalidated',
    'message port closed',
    'before a response was received',
    'the tab was closed',
    'cannot access a chrome://',
    'cannot access contents of the page',
    'cannot access contents of url',
    'missing host permission',
  ].some((snippet) => message.includes(snippet));
}

export function getUnsupportedAutofillPageMessage() {
  return UNSUPPORTED_PAGE_ERROR;
}

export function getInvalidAutofillResponseMessage() {
  return INVALID_RESPONSE_ERROR;
}

function getTabUrl(tab?: { url?: string; pendingUrl?: string }) {
  return tab?.url ?? tab?.pendingUrl;
}

export function isAutofillContentResponse(value: unknown): value is AutofillContentResponse {
  if (!value || typeof value !== 'object') return false;

  const response = value as Record<string, unknown>;
  const reason = response.reason;

  return (
    typeof response.ok === 'boolean' &&
    typeof response.filledCount === 'number' &&
    Array.isArray(response.fields) &&
    response.fields.every((field) => typeof field === 'string') &&
    (response.error === undefined || typeof response.error === 'string') &&
    (reason === undefined ||
      (typeof reason === 'string' && VALID_FAILURE_REASONS.has(reason as AutofillFailureReason)))
  );
}

export function normalizeAutofillTabError(tab?: {
  id?: number;
  url?: string;
  pendingUrl?: string;
}) {
  if (!tab?.id) {
    return 'Open a page first, then try autofill again.';
  }

  if (hasUnsupportedProtocol(getTabUrl(tab))) {
    return UNSUPPORTED_PAGE_ERROR;
  }

  return null;
}

export function getAutofillErrorMessage(
  error: unknown,
  tab?: { url?: string; pendingUrl?: string },
) {
  if (hasUnsupportedProtocol(getTabUrl(tab))) {
    return UNSUPPORTED_PAGE_ERROR;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (isUnsupportedPageTransportMessage(message)) {
      return UNSUPPORTED_PAGE_ERROR;
    }

    return error.message;
  }

  return 'Autofill failed.';
}

export function getAutofillResponseMessage(response: AutofillContentResponse) {
  if (response.ok) {
    return `Filled ${response.filledCount} field${response.filledCount === 1 ? '' : 's'}.`;
  }

  if (response.reason === 'no-fields') {
    return NO_FIELDS_ERROR;
  }

  if (response.reason === 'runtime') {
    return response.error ?? 'Autofill failed on this page.';
  }

  if (response.reason === 'payload') {
    return response.error ?? 'Malformed autofill profile payload.';
  }

  if (!response.error) {
    return NO_FIELDS_ERROR;
  }

  const normalizedError = response.error.toLowerCase();
  if (normalizedError.includes('no supported fields found')) {
    return NO_FIELDS_ERROR;
  }

  return response.error;
}
