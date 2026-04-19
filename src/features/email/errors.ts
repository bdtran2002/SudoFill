export type MailboxError =
  | { type: 'mail-tm-request'; message: string; status?: number }
  | { type: 'mail-tm-no-domain'; message: string }
  | { type: 'mailbox-missing-session'; message: string }
  | { type: 'browser'; message: string }
  | { type: 'unexpected'; message: string };

export function getMailboxErrorType(error: MailboxError) {
  return error.type;
}

export function toMailboxErrorMessage(error: MailboxError) {
  return error.message;
}

export function toUnexpectedMailboxError(
  error: unknown,
  fallbackMessage = 'Unexpected mailbox error',
): MailboxError {
  if (error instanceof Error && error.message) {
    return {
      type: 'unexpected',
      message: error.message,
    };
  }

  return {
    type: 'unexpected',
    message: fallbackMessage,
  };
}
