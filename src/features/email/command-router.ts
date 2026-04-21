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
  const unknownCommandResponse = (): MailboxResponse => ({
    ok: false,
    error: 'Unknown command',
    snapshot: handlers.getSnapshot(),
  });

  const matchCommandResult = <T>(
    command: MailboxCommand['type'],
    phase: string,
    result: ResultAsync<T, MailboxError>,
  ) => result.match(successResponse, (error) => handlers.onError(error, { command, phase }));

  const getCommandExecution = (command: MailboxCommand) => {
    switch (command.type) {
      case 'mailbox:create':
        return { phase: 'createMailbox', result: handlers.createMailbox() };
      case 'mailbox:refresh':
        return { phase: 'refreshMailbox', result: handlers.refreshMailbox() };
      case 'mailbox:discard':
        return { phase: 'discardMailbox', result: handlers.discardMailbox() };
      case 'mailbox:open-message':
        return { phase: 'openMessage', result: handlers.openMessage(command.messageId) };
      case 'mailbox:open-link':
        return { phase: 'openLink', result: handlers.openLink(command.url) };
      default:
        return null;
    }
  };

  return async function handleCommand(command: MailboxCommand): Promise<MailboxResponse> {
    if (command.type === 'mailbox:get-state') {
      return successResponse();
    }

    const execution = getCommandExecution(command);
    if (!execution) {
      return unknownCommandResponse();
    }

    return matchCommandResult(command.type, execution.phase, execution.result);
  };
}
