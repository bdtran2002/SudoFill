import type { AutofillContentResponse, AutofillFailureReason } from './types';

const UNSUPPORTED_PROTOCOLS = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'moz-extension:'];

const UNSUPPORTED_PAGE_ERROR = 'Autofill is not available on this page yet.';
const NO_FIELDS_ERROR = 'No supported fields found on this page.';
const INVALID_RESPONSE_ERROR = 'Autofill could not confirm whether the page was filled.';
const DEFAULT_AUTOFILL_ERROR = 'Autofill failed.';
const OPEN_PAGE_FIRST_ERROR = 'Open a page first, then try autofill again.';
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

function getUnsupportedPageMessageForTab(tab?: { url?: string; pendingUrl?: string }) {
  return hasUnsupportedProtocol(getTabUrl(tab)) ? UNSUPPORTED_PAGE_ERROR : null;
}

function getResponseFailureMessage(response: AutofillContentResponse) {
  if (response.reason === 'runtime') {
    return response.error ?? 'Autofill failed on this page.';
  }

  if (response.reason === 'payload') {
    return response.error ?? 'Malformed autofill profile payload.';
  }

  return response.error;
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
  if (tab?.id == null) {
    return OPEN_PAGE_FIRST_ERROR;
  }

  return getUnsupportedPageMessageForTab(tab);
}

export function getAutofillErrorMessage(
  error: unknown,
  tab?: { url?: string; pendingUrl?: string },
) {
  const unsupportedPageMessage = getUnsupportedPageMessageForTab(tab);
  if (unsupportedPageMessage) {
    return unsupportedPageMessage;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (isUnsupportedPageTransportMessage(message)) {
      return UNSUPPORTED_PAGE_ERROR;
    }

    return error.message;
  }

  return DEFAULT_AUTOFILL_ERROR;
}

export function getAutofillResponseMessage(response: AutofillContentResponse) {
  if (response.ok) {
    return `Filled ${response.filledCount} field${response.filledCount === 1 ? '' : 's'}.`;
  }

  if (response.reason === 'no-fields') {
    return NO_FIELDS_ERROR;
  }

  const failureMessage = getResponseFailureMessage(response);

  if (!failureMessage) {
    return NO_FIELDS_ERROR;
  }

  const normalizedError = failureMessage.toLowerCase();
  if (normalizedError.includes('no supported fields found')) {
    return NO_FIELDS_ERROR;
  }

  return failureMessage;
}
