export type MailboxError =
  | { type: 'mail-tm-request'; message: string; status?: number }
  | { type: 'mail-tm-no-domain'; message: string }
  | { type: 'mailbox-missing-session'; message: string }
  | { type: 'browser'; message: string }
  | { type: 'unexpected'; message: string };

/**
 * Returns the stable discriminator for a mailbox error.
 */
export function getMailboxErrorType(error: MailboxError) {
  return error.type;
}

/**
 * Returns a user-facing mailbox error message.
 */
export function toMailboxErrorMessage(error: MailboxError) {
  return error.message;
}

/**
 * Normalizes unknown failures into the mailbox error contract.
 */
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
