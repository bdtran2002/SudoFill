export type MessageLink = {
  label: string;
  url: string;
};

export type MailboxMessageSummary = {
  id: string;
  from: string;
  subject: string;
  intro: string;
  createdAt: string;
  seen: boolean;
  hasAttachments?: boolean;
};

export type MailboxMessageDetail = MailboxMessageSummary & {
  to: string[];
  text?: string;
  html?: string;
  links: MessageLink[];
};

export type MailMessage = {
  id: string;
  from: string;
  subject: string;
  intro: string;
  createdAt: string;
  seen: boolean;
  text?: string | null;
  html?: string | null;
  links: MessageLink[];
};

export type MailboxSnapshot = {
  status: 'idle' | 'creating' | 'active' | 'error';
  address: string | null;
  unreadCount: number;
  messages: MailMessage[];
  selectedMessageId: string | null;
  selectedMessage: MailMessage | null;
  lastCheckedAt: string | null;
  error: string | null;
};

export type SavedEmailTemplate = {
  id: string;
  name: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type EmailHistoryItem = {
  id: string;
  address: string;
  action: 'created' | 'reused' | 'deleted' | 'edited';
  createdAt: string;
};

export type EmailVersion = {
  id: string;
  templateId: string;
  address: string;
  notes: string;
  createdAt: string;
};

export type ActiveMailboxSession = {
  id: string;
  address: string;
  password: string;
  token: string;
  accountId: string;
  messages: MailMessage[];
  knownMessageIds: string[];
  unreadMessageIds: string[];
  selectedMessageId: string | null;
  selectedMessage: MailMessage | null;
  lastCheckedAt: string | null;
};

export type MailboxCommand =
  | { type: 'mailbox:get-state' }
  | { type: 'mailbox:create' }
  | { type: 'mailbox:refresh' }
  | { type: 'mailbox:discard' }
  | { type: 'mailbox:open-message'; messageId: string }
  | { type: 'mailbox:open-link'; url: string };

export type MailboxResponse = {
  ok: boolean;
  error?: string;
  snapshot: MailboxSnapshot;
};
