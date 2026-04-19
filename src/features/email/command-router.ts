import type { ResultAsync } from 'neverthrow';

import type { MailboxError } from './errors';
import type { MailboxCommand, MailboxDiagnostics, MailboxResponse, MailboxSnapshot } from './types';

export interface CommandHandlers {
  getSnapshot: () => MailboxSnapshot;
  createMailbox: () => ResultAsync<void, MailboxError>;
  refreshMailbox: () => ResultAsync<void, MailboxError>;
  discardMailbox: () => ResultAsync<void, MailboxError>;
  openMessage: (messageId: string) => ResultAsync<void, MailboxError>;
  openLink: (url: string) => ResultAsync<void, MailboxError>;
  onError: (error: MailboxError, diagnostics: MailboxDiagnostics) => Promise<MailboxResponse>;
}

export function createCommandHandler(handlers: CommandHandlers) {
  const successResponse = (): MailboxResponse => ({ ok: true, snapshot: handlers.getSnapshot() });

  const matchCommandResult = <T>(
    command: MailboxCommand['type'],
    phase: string,
    result: ResultAsync<T, MailboxError>,
  ) => result.match(successResponse, (error) => handlers.onError(error, { command, phase }));

  return async function handleCommand(command: MailboxCommand): Promise<MailboxResponse> {
    switch (command.type) {
      case 'mailbox:get-state':
        return successResponse();
      case 'mailbox:create':
        return matchCommandResult(command.type, 'createMailbox', handlers.createMailbox());
      case 'mailbox:refresh':
        return matchCommandResult(command.type, 'refreshMailbox', handlers.refreshMailbox());
      case 'mailbox:discard':
        return matchCommandResult(command.type, 'discardMailbox', handlers.discardMailbox());
      case 'mailbox:open-message':
        return matchCommandResult(
          command.type,
          'openMessage',
          handlers.openMessage(command.messageId),
        );
      case 'mailbox:open-link':
        return matchCommandResult(command.type, 'openLink', handlers.openLink(command.url));
      default:
        return { ok: false, error: 'Unknown command', snapshot: handlers.getSnapshot() };
    }
  };
}
