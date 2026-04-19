import type { AutofillContentResponse } from './types';

const UNSUPPORTED_PROTOCOLS = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'moz-extension:'];

const UNSUPPORTED_PAGE_ERROR = 'Autofill is not available on this page yet.';
const NO_FIELDS_ERROR = 'No supported fields found on this page.';

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

export function normalizeAutofillTabError(tab?: { id?: number; url?: string }) {
  if (!tab?.id) {
    return 'Open a page first, then try autofill again.';
  }

  if (hasUnsupportedProtocol(tab.url)) {
    return UNSUPPORTED_PAGE_ERROR;
  }

  return null;
}

export function getAutofillErrorMessage(error: unknown, tab?: { url?: string }) {
  if (hasUnsupportedProtocol(tab?.url)) {
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

  if (!response.error) {
    return NO_FIELDS_ERROR;
  }

  const normalizedError = response.error.toLowerCase();
  if (
    normalizedError.includes('no supported fields found') ||
    normalizedError.includes('autofill failed on this page')
  ) {
    return NO_FIELDS_ERROR;
  }

  return response.error;
}
