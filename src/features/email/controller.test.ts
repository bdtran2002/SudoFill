import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { createMailboxController } from './controller';
import type { MailboxError } from './errors';
import type { ActiveMailboxSession, MailboxMessageDetail } from './types';

interface ControllerOptions {
  createMailTmSession?: ResultAsync<ActiveMailboxSession, MailboxError>;
  listMailTmMessages?: ResultAsync<ActiveMailboxSession['messages'], MailboxError>;
  getMailTmMessage?: ResultAsync<MailboxMessageDetail | null, MailboxError>;
  deleteMailTmAccount?: ResultAsync<void, MailboxError>;
  storageGetResult?: Record<string, unknown>;
  storageSet?: () => Promise<void>;
  storageRemove?: () => Promise<void>;
  alarmCreate?: () => Promise<void>;
  alarmClear?: () => Promise<boolean>;
  setBadgeBackgroundColor?: () => Promise<void>;
  setBadgeText?: () => Promise<void>;
}

function createSession(overrides: Partial<ActiveMailboxSession> = {}): ActiveMailboxSession {
  return {
    address: 'hello@example.com',
    password: 'secret-password',
    token: 'secret-token',
    accountId: 'account-1',
    messages: [],
    selectedMessageId: null,
    selectedMessage: null,
    unreadMessageIds: [],
    knownMessageIds: [],
    lastCheckedAt: null,
    createdAt: '2026-04-18T00:00:00.000Z',
    ...overrides,
  };
}

function createMessageDetail(): MailboxMessageDetail {
  return {
    id: 'message-1',
    from: 'sender@example.com',
    subject: 'Subject',
    intro: 'Preview',
    createdAt: '2026-04-18T00:00:00.000Z',
    seen: false,
    hasAttachments: false,
    to: ['hello@example.com'],
    text: 'Body',
    html: '',
    links: [],
  };
}

function createController(options: ControllerOptions = {}) {
  return createMailboxController({
    createMailTmSession: () => options.createMailTmSession ?? okAsync(createSession()),
    deleteMailTmAccount: () => options.deleteMailTmAccount ?? okAsync(undefined),
    listMailTmMessages: () => options.listMailTmMessages ?? okAsync([]),
    getMailTmMessage: () => options.getMailTmMessage ?? okAsync(createMessageDetail()),
    storageGet: async () => options.storageGetResult ?? {},
    storageSet: options.storageSet ?? (async () => undefined),
    storageRemove: options.storageRemove ?? (async () => undefined),
    alarmCreate: async () => {
      await (options.alarmCreate ?? (async () => undefined))();
    },
    alarmClear: async () => {
      await (options.alarmClear ?? (async () => true))();
      return true;
    },
    setBadgeBackgroundColor: async () => {
      await (options.setBadgeBackgroundColor ?? (async () => undefined))();
    },
    setBadgeText: async () => {
      await (options.setBadgeText ?? (async () => undefined))();
    },
    openTab: async () => undefined,
    setTimeout: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
    clearTimeout: vi.fn(),
  });
}

describe('createMailboxController', () => {
  it('returns a successful active snapshot when mailbox creation succeeds', async () => {
    const controller = createController();

    const response = await controller.handleCommand({ type: 'mailbox:create' });

    expect(response.ok).toBe(true);
    expect(response.snapshot.status).toBe('active');
    expect(response.snapshot.address).toBe('hello@example.com');
  });

  it('returns an error response when storage persistence fails during create', async () => {
    const controller = createController({
      storageSet: async () => {
        throw new Error('storage failed');
      },
    });

    const response = await controller.handleCommand({ type: 'mailbox:create' });

    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error('Expected create to fail');
    }
    expect(response.error).toContain('storage failed');
    expect(response.snapshot.status).toBe('active');
    expect(response.snapshot.address).toBe('hello@example.com');
  });

  it('returns an error response when alarm setup fails during create', async () => {
    const controller = createController({
      alarmCreate: async () => {
        throw new Error('alarm failed');
      },
    });

    const response = await controller.handleCommand({ type: 'mailbox:create' });

    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error('Expected create to fail');
    }
    expect(response.error).toContain('alarm failed');
    expect(response.snapshot.status).toBe('active');
  });

  it('returns an error response when refresh polling fails', async () => {
    const session = createSession();
    const controller = createController({
      storageGetResult: {
        'email.activeMailbox': session,
      },
      listMailTmMessages: errAsync({
        type: 'mail-tm-request',
        message: 'refresh failed',
      }),
    });

    await controller.initialize().match(
      () => undefined,
      () => undefined,
    );
    const response = await controller.handleCommand({ type: 'mailbox:refresh' });

    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error('Expected refresh to fail');
    }
    expect(response.error).toBe('Failed to refresh mailbox');
    expect(response.snapshot.status).toBe('active');
    expect(response.snapshot.address).toBe(session.address);
  });

  it('clears local state even when remote delete fails', async () => {
    const session = createSession();
    const controller = createController({
      storageGetResult: {
        'email.activeMailbox': session,
      },
      deleteMailTmAccount: errAsync({
        type: 'unexpected',
        message: 'delete failed',
      }),
    });

    await controller.initialize().match(
      () => undefined,
      () => undefined,
    );
    const response = await controller.handleCommand({ type: 'mailbox:discard' });

    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error('Expected discard to fail');
    }
    expect(response.error).toBe('delete failed');
    expect(response.snapshot.status).toBe('error');
    expect(response.snapshot.address).toBeNull();
  });

  it('treats undefined storage restore state as empty', async () => {
    const controller = createController({
      storageGetResult: undefined as unknown as Record<string, unknown>,
    });

    await controller.initialize().match(
      () => undefined,
      () => undefined,
    );

    const response = await controller.handleCommand({ type: 'mailbox:get-state' });

    expect(response.ok).toBe(true);
    expect(response.snapshot.status).toBe('idle');
    expect(response.snapshot.address).toBeNull();
  });
});
