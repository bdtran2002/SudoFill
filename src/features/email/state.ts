import type { ActiveMailboxSession, MailboxSnapshot } from './types';

export const EMPTY_MAILBOX_SNAPSHOT: MailboxSnapshot = {
  status: 'idle',
  address: null,
  unreadCount: 0,
  messages: [],
  selectedMessageId: null,
  selectedMessage: null,
  lastCheckedAt: null,
  error: null,
};

export function toMailboxSnapshot(
  session: ActiveMailboxSession | null,
  overrides?: Partial<MailboxSnapshot>,
): MailboxSnapshot {
  if (!session) {
    return {
      ...EMPTY_MAILBOX_SNAPSHOT,
      ...overrides,
    };
  }

  return {
    status: 'active',
    address: session.address,
    unreadCount: session.unreadMessageIds.length,
    messages: session.messages,
    selectedMessageId: session.selectedMessageId,
    selectedMessage: session.selectedMessage,
    lastCheckedAt: session.lastCheckedAt,
    error: null,
    ...overrides,
  };
}
