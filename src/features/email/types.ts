export type MailboxStatus = 'idle' | 'creating' | 'active' | 'error';

export interface MailboxLink {
  label: string;
  url: string;
}

export interface MailboxMessageSummary {
  id: string;
  from: string;
  subject: string;
  intro: string;
  createdAt: string;
  seen: boolean;
  hasAttachments: boolean;
}

export interface MailboxMessageDetail extends MailboxMessageSummary {
  to: string[];
  text: string;
  html: string;
  links: MailboxLink[];
}

export interface MailboxDiagnostics {
  command?: MailboxCommand['type'];
  phase?: string;
  errorType?: string;
}

export interface MailboxSnapshot {
  status: MailboxStatus;
  address: string | null;
  unreadCount: number;
  messages: MailboxMessageSummary[];
  selectedMessageId: string | null;
  selectedMessage: MailboxMessageDetail | null;
  lastCheckedAt: string | null;
  error: string | null;
  diagnostics: MailboxDiagnostics | null;
}

export interface ActiveMailboxSession {
  address: string;
  password: string;
  token: string;
  accountId: string;
  messages: MailboxMessageSummary[];
  selectedMessageId: string | null;
  selectedMessage: MailboxMessageDetail | null;
  unreadMessageIds: string[];
  knownMessageIds: string[];
  lastCheckedAt: string | null;
  createdAt: string;
}

export type MailboxCommand =
  | { type: 'mailbox:get-state' }
  | { type: 'mailbox:create' }
  | { type: 'mailbox:refresh' }
  | { type: 'mailbox:discard' }
  | { type: 'mailbox:open-message'; messageId: string }
  | { type: 'mailbox:open-link'; url: string };

export type MailboxResponse =
  | { ok: true; snapshot: MailboxSnapshot }
  | { ok: false; error: string; snapshot: MailboxSnapshot; diagnostics?: MailboxDiagnostics };
