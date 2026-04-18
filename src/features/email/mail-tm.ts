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

function createMailboxAddress(domain: string) {
  const localPart = faker.string.alphanumeric({ casing: 'lower', length: 12 });
  return `${localPart}@${domain}`;
}

function createMailboxPassword() {
  return faker.string.alphanumeric({ length: 20 });
}

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

function normalizeHtml(html: MailTmMessageDetailResponse['html']) {
  if (Array.isArray(html)) {
    return html.join('\n\n');
  }

  return html ?? '';
}

export function createMailTmSession(): ResultAsync<ActiveMailboxSession, MailboxError> {
  return getAvailableDomain().andThen((domain) => {
    const address = createMailboxAddress(domain);
    const password = createMailboxPassword();

    return mailTmFetch<MailTmAccount>('/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        password,
      }),
    }).andThen((account) =>
      mailTmFetch<MailTmToken>('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          password,
        }),
      }).map((tokenResponse) => ({
        address: account.address,
        password,
        token: tokenResponse.token,
        accountId: account.id,
        messages: [],
        selectedMessageId: null,
        selectedMessage: null,
        unreadMessageIds: [],
        knownMessageIds: [],
        lastCheckedAt: null,
        createdAt: new Date().toISOString(),
      })),
    );
  });
}

export function listMailTmMessages(
  token: string,
): ResultAsync<MailboxMessageSummary[], MailboxError> {
  return mailTmFetch<MailTmCollection<MailTmMessageListItem>>('/messages', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).map((response) => response['hydra:member'].map(normalizeMessageSummary));
}

export function getMailTmMessage(
  token: string,
  messageId: string,
): ResultAsync<MailboxMessageDetail, MailboxError> {
  return mailTmFetch<MailTmMessageDetailResponse>(`/messages/${messageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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

export function deleteMailTmAccount(
  session: ActiveMailboxSession,
): ResultAsync<void, MailboxError> {
  return ResultAsync.fromPromise(
    fetch(`${MAIL_TM_API_BASE_URL}/accounts/${session.accountId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    }),
    (error) => toUnexpectedMailboxError(error, 'Failed to delete Mail.tm account'),
  )
    .andThen(() => okAsync(undefined))
    .orElse(() => okAsync(undefined));
}
