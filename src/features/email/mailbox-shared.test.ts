import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/webext-async', () => ({
  callWebExtensionApi: vi.fn(),
}));

import { callWebExtensionApi } from '../../lib/webext-async';
import { fillVerificationCodeOnPage, getPageInteractionTab } from './mailbox-shared';

describe('mailbox shared tab selection', () => {
  beforeEach(() => {
    vi.mocked(callWebExtensionApi).mockReset();
  });

  it('prefers the active https tab over extension pages', async () => {
    vi.mocked(callWebExtensionApi)
      .mockResolvedValueOnce([
        { id: 1, active: true, url: 'chrome-extension://abc/popup.html' },
      ])
      .mockResolvedValueOnce([
        { id: 1, active: true, url: 'chrome-extension://abc/popup.html' },
        { id: 2, active: false, url: 'https://example.com/login' },
      ]);

    await expect(getPageInteractionTab()).resolves.toMatchObject({ id: 2 });
  });

  it('does not target http tabs for verification fill', async () => {
    vi.mocked(callWebExtensionApi)
      .mockResolvedValueOnce([{ id: 1, active: true, url: 'http://example.com' }])
      .mockResolvedValueOnce([{ id: 1, active: true, url: 'http://example.com' }])
      .mockResolvedValueOnce([{ id: 1, active: true, url: 'http://example.com' }]);

    await expect(getPageInteractionTab()).resolves.toBeUndefined();
  });

  it('returns false when no page tab can receive the code', async () => {
    vi.mocked(callWebExtensionApi).mockResolvedValueOnce([
      { id: 1, active: true, url: 'chrome-extension://abc/popup.html' },
    ]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(fillVerificationCodeOnPage('123456')).resolves.toBe(false);
  });
});
