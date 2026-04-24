import { describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';

import { createCommandHandler } from './command-router';
import type { MailboxSnapshot } from './types';

const snapshot: MailboxSnapshot = {
  status: 'active',
  address: 'test@example.com',
  pollingActive: true,
  unreadCount: 2,
  messages: [],
  selectedMessageId: null,
  selectedMessage: null,
  lastCheckedAt: null,
  error: null,
  diagnostics: null,
};

describe('createCommandHandler', () => {
  it('returns current state for get-state and unknown commands', async () => {
    const handler = createCommandHandler({
      getSnapshot: () => snapshot,
      createMailbox: () => okAsync(undefined),
      refreshMailbox: () => okAsync(undefined),
      discardMailbox: () => okAsync(undefined),
      openMessage: () => okAsync(undefined),
      openLink: () => okAsync(undefined),
      onError: vi.fn(),
    });

    await expect(handler({ type: 'mailbox:get-state' })).resolves.toEqual({
      ok: true,
      snapshot,
    });

    await expect(handler({ type: 'mailbox:unknown' as never })).resolves.toEqual({
      ok: false,
      error: 'Unknown command',
      snapshot,
    });
  });

  it('routes command failures through the shared error handler with diagnostics', async () => {
    const onError = vi.fn(async (_error, diagnostics) => ({
      ok: false as const,
      error: 'boom',
      snapshot: {
        ...snapshot,
        error: 'boom',
        diagnostics,
      },
      diagnostics,
    }));
    const handler = createCommandHandler({
      getSnapshot: () => snapshot,
      createMailbox: () => errAsync({ type: 'browser', message: 'boom' }),
      refreshMailbox: () => okAsync(undefined),
      discardMailbox: () => okAsync(undefined),
      openMessage: () => okAsync(undefined),
      openLink: () => okAsync(undefined),
      onError,
    });

    await expect(handler({ type: 'mailbox:create' })).resolves.toEqual({
      ok: false,
      error: 'boom',
      snapshot: {
        ...snapshot,
        error: 'boom',
        diagnostics: {
          command: 'mailbox:create',
          phase: 'createMailbox',
        },
      },
      diagnostics: {
        command: 'mailbox:create',
        phase: 'createMailbox',
      },
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      { type: 'browser', message: 'boom' },
      { command: 'mailbox:create', phase: 'createMailbox' },
    );
  });

  it('routes open-link commands through the mapped handler', async () => {
    const openLink = vi.fn(() => okAsync(undefined));
    const handler = createCommandHandler({
      getSnapshot: () => snapshot,
      createMailbox: () => okAsync(undefined),
      refreshMailbox: () => okAsync(undefined),
      discardMailbox: () => okAsync(undefined),
      openMessage: () => okAsync(undefined),
      openLink,
      onError: vi.fn(),
    });

    await expect(
      handler({ type: 'mailbox:open-link', url: 'https://example.com' }),
    ).resolves.toEqual({
      ok: true,
      snapshot,
    });
    expect(openLink).toHaveBeenCalledWith('https://example.com');
  });
});
