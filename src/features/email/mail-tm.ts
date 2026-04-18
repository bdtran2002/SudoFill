import { faker } from '@faker-js/faker';

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

async function mailTmFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MAIL_TM_API_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(`Mail.tm request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function getAvailableDomain() {
  const response = await mailTmFetch<MailTmCollection<MailTmDomain>>('/domains');
  const domain = response['hydra:member'].find((item) => item.isActive && !item.isPrivate);

  if (!domain) {
    throw new Error('No Mail.tm domains are currently available');
  }

  return domain.domain;
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

export async function createMailTmSession(): Promise<ActiveMailboxSession> {
  const domain = await getAvailableDomain();
  const address = createMailboxAddress(domain);
  const password = createMailboxPassword();

  const account = await mailTmFetch<MailTmAccount>('/accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address,
      password,
    }),
  });

  const tokenResponse = await mailTmFetch<MailTmToken>('/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address,
      password,
    }),
  });

  return {
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
  };
}

export async function listMailTmMessages(token: string) {
  const response = await mailTmFetch<MailTmCollection<MailTmMessageListItem>>('/messages', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response['hydra:member'].map(normalizeMessageSummary);
}

export async function getMailTmMessage(
  token: string,
  messageId: string,
): Promise<MailboxMessageDetail> {
  const message = await mailTmFetch<MailTmMessageDetailResponse>(`/messages/${messageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

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
}

export async function deleteMailTmAccount(session: ActiveMailboxSession) {
  await fetch(`${MAIL_TM_API_BASE_URL}/accounts/${session.accountId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  }).catch(() => undefined);
}
