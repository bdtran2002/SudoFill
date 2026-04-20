import { faker } from '@faker-js/faker';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { toUnexpectedMailboxError, type MailboxError } from './errors';
import { extractMailboxLinks } from './link-extractor';
import type { ActiveMailboxSession, MailboxMessageDetail, MailboxMessageSummary } from './types';

const MAIL_TM_API_BASE_URL = 'https://api.mail.tm';

interface MailTmCollection<T> {
  'hydra:member': T[];
}

interface MailTmDomain {
  domain: string;
  isActive: boolean;
  isPrivate: boolean;
}

interface MailTmAccount {
  id: string;
  address: string;
}

interface MailTmToken {
  token: string;
}

interface MailTmMessageListItem {
  id: string;
  from?: { address?: string; name?: string };
  subject?: string;
  intro?: string;
  seen?: boolean;
  hasAttachments?: boolean;
  createdAt?: string;
}

interface MailTmMessageDetailResponse extends MailTmMessageListItem {
  to?: Array<{ address?: string }>;
  text?: string;
  html?: string[] | string | null;
}

/**
 * Performs a Mail.tm API request and normalizes transport and response errors.
 */
function mailTmFetch<T>(path: string, init?: RequestInit): ResultAsync<T, MailboxError> {
  return ResultAsync.fromPromise(fetch(`${MAIL_TM_API_BASE_URL}${path}`, init), (error) =>
    toUnexpectedMailboxError(error, 'Mail.tm request failed'),
  ).andThen((response) => {
    if (!response.ok) {
      return errAsync({
        type: 'mail-tm-request' as const,
        status: response.status,
        message: `Mail.tm request failed with ${response.status}`,
      });
    }

    return ResultAsync.fromPromise(response.json() as Promise<T>, (error) =>
      toUnexpectedMailboxError(error, 'Mail.tm returned an invalid response'),
    );
  });
}

/**
 * Finds the first public Mail.tm domain that can be used for account creation.
 */
function getAvailableDomain(): ResultAsync<string, MailboxError> {
  return mailTmFetch<MailTmCollection<MailTmDomain>>('/domains').andThen((response) => {
    const domain = response['hydra:member'].find((item) => item.isActive && !item.isPrivate);

    if (!domain) {
      return errAsync({
        type: 'mail-tm-no-domain' as const,
        message: 'No Mail.tm domains are currently available',
      });
    }

    return okAsync(domain.domain);
  });
}

/**
 * Generates a random Mail.tm mailbox address for a given domain.
 */
function createMailboxAddress(domain: string) {
  const localPart = faker.string.alphanumeric({ casing: 'lower', length: 12 });
  return `${localPart}@${domain}`;
}

/**
 * Generates a random password for a temporary Mail.tm account.
 */
function createMailboxPassword() {
  return faker.string.alphanumeric({ length: 20 });
}

function createMailTmJsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function createMailTmAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function createMailTmSessionSnapshot(
  account: MailTmAccount,
  password: string,
  token: string,
): ActiveMailboxSession {
  return {
    address: account.address,
    password,
    token,
    accountId: account.id,
    messages: [],
    selectedMessageId: null,
    selectedMessage: null,
    unreadMessageIds: [],
    knownMessageIds: [],
    lastCheckedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Converts a Mail.tm message list item into the extension summary shape.
 */
function normalizeMessageSummary(message: MailTmMessageListItem): MailboxMessageSummary {
  const fromAddress = message.from?.address ?? 'Unknown sender';
  const fromName = message.from?.name?.trim();

  return {
    id: message.id,
    from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
    subject: message.subject?.trim() || '(no subject)',
    intro: message.intro?.trim() || 'No preview available.',
    createdAt: message.createdAt ?? new Date().toISOString(),
    seen: message.seen ?? false,
    hasAttachments: message.hasAttachments ?? false,
  };
}

/**
 * Normalizes Mail.tm HTML payloads into a single string.
 */
function normalizeHtml(html: MailTmMessageDetailResponse['html']) {
  if (Array.isArray(html)) {
    return html.join('\n\n');
  }

  return html ?? '';
}

/**
 * Creates a new temporary mailbox session backed by Mail.tm.
 */
export function createMailTmSession(): ResultAsync<ActiveMailboxSession, MailboxError> {
  return getAvailableDomain().andThen((domain) => {
    const address = createMailboxAddress(domain);
    const password = createMailboxPassword();
    const credentials = { address, password };

    return mailTmFetch<MailTmAccount>('/accounts', createMailTmJsonRequest(credentials)).andThen(
      (account) =>
        mailTmFetch<MailTmToken>('/token', createMailTmJsonRequest(credentials)).map(
          (tokenResponse) => createMailTmSessionSnapshot(account, password, tokenResponse.token),
        ),
    );
  });
}

/**
 * Lists message summaries for an authenticated Mail.tm mailbox.
 */
export function listMailTmMessages(
  token: string,
): ResultAsync<MailboxMessageSummary[], MailboxError> {
  return mailTmFetch<MailTmCollection<MailTmMessageListItem>>('/messages', {
    headers: createMailTmAuthHeaders(token),
  }).map((response) => response['hydra:member'].map(normalizeMessageSummary));
}

/**
 * Fetches a full Mail.tm message and enriches it with parsed links.
 */
export function getMailTmMessage(
  token: string,
  messageId: string,
): ResultAsync<MailboxMessageDetail, MailboxError> {
  return mailTmFetch<MailTmMessageDetailResponse>(`/messages/${messageId}`, {
    headers: createMailTmAuthHeaders(token),
  }).map((message) => {
    const summary = normalizeMessageSummary(message);
    const text = message.text?.trim() ?? '';
    const html = normalizeHtml(message.html);

    return {
      ...summary,
      to: (message.to ?? []).map((recipient) => recipient.address).filter(Boolean) as string[],
      text,
      html,
      links: extractMailboxLinks(text, html),
    };
  });
}

/**
 * Best-effort deletes the underlying Mail.tm account for a session.
 */
export function deleteMailTmAccount(
  session: ActiveMailboxSession,
): ResultAsync<void, MailboxError> {
  return ResultAsync.fromPromise(
    fetch(`${MAIL_TM_API_BASE_URL}/accounts/${session.accountId}`, {
      method: 'DELETE',
      headers: createMailTmAuthHeaders(session.token),
    }),
    (error) => toUnexpectedMailboxError(error, 'Failed to delete Mail.tm account'),
  )
    .andThen(() => okAsync(undefined))
    .orElse(() => okAsync(undefined));
}
