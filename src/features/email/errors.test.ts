import { describe, expect, it } from 'vitest';

import { getMailboxErrorType, toMailboxErrorMessage, toUnexpectedMailboxError } from './errors';

describe('mailbox errors', () => {
  it('preserves Error messages and uses fallback for non-Error input', () => {
    expect(toUnexpectedMailboxError(new Error('boom'))).toEqual({
      type: 'unexpected',
      message: 'boom',
    });

    expect(toUnexpectedMailboxError('nope')).toEqual({
      type: 'unexpected',
      message: 'Unexpected mailbox error',
    });
  });

  it('returns passthrough type and message', () => {
    const error = { type: 'browser', message: 'failed' } as const;

    expect(getMailboxErrorType(error)).toBe('browser');
    expect(toMailboxErrorMessage(error)).toBe('failed');
  });
});
