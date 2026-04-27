import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@faker-js/faker', () => ({
  faker: {
    string: {
      alphanumeric: vi.fn(),
    },
    helpers: {
      arrayElement: vi.fn(),
    },
  },
}));

import { faker } from '@faker-js/faker';

import {
  createMailTmSession,
  deleteMailTmAccount,
  getMailTmMessage,
  listMailTmMessages,
  listAvailableMailTmDomains,
} from './mail-tm';

const alphanumericMock = faker.string.alphanumeric as unknown as ReturnType<typeof vi.fn>;
const arrayElementMock = faker.helpers.arrayElement as unknown as ReturnType<typeof vi.fn>;

const session = {
  address: 'test@example.com',
  password: 'pw',
  token: 'token',
  accountId: 'acct-1',
  messages: [],
  selectedMessageId: null,
  selectedMessage: null,
  unreadMessageIds: [],
  knownMessageIds: [],
  browserNotificationMessageIds: [],
  lastCheckedAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
};

function mockJsonResponse(body: unknown, init?: ResponseInit) {
  return {
    ok: init?.status ? init.status >= 200 && init.status < 300 : true,
    status: init?.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('mail-tm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    alphanumericMock.mockReset();
    arrayElementMock.mockReset();
    alphanumericMock.mockImplementation((options?: number | { length?: number }) => {
      const length = typeof options === 'number' ? options : options?.length;
      return length === 20 ? 'abcdefghijklmnopqrst' : 'abcdefghijkl';
    });
    arrayElementMock.mockImplementation((items: string[]) => items[0]);
  });

  it('creates a session from the first active public domain', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        'hydra:member': [
          { domain: 'private.example', isActive: true, isPrivate: true },
          { domain: 'inactive.example', isActive: false, isPrivate: false },
          { domain: 'public.example', isActive: true, isPrivate: false },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ id: 'acct-1', address: 'abcdefghijkl@public.example' }),
    );
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ token: 'token-1' }));

    const result = await createMailTmSession();

    expect(result.isErr()).toBe(false);
    if (result.isOk()) {
      expect(result.value).toEqual({
        address: 'abcdefghijkl@public.example',
        password: 'abcdefghijklmnopqrst',
        token: 'token-1',
        accountId: 'acct-1',
        browserNotificationMessageIds: [],
        messages: [],
        selectedMessageId: null,
        selectedMessage: null,
        unreadMessageIds: [],
        knownMessageIds: [],
        lastCheckedAt: null,
        createdAt: '2025-01-01T00:00:00.000Z',
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      address: 'abcdefghijkl@public.example',
      password: 'abcdefghijklmnopqrst',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      address: 'abcdefghijkl@public.example',
      password: 'abcdefghijklmnopqrst',
    });
  });

  it('retries account creation once with fresh credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    alphanumericMock
      .mockReturnValueOnce('firstaddress')
      .mockReturnValueOnce('firstpassword1234567')
      .mockReturnValueOnce('secondaddress')
      .mockReturnValueOnce('secondpassword12345');

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        'hydra:member': [{ domain: 'public.example', isActive: true, isPrivate: false }],
      }),
    );
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, { status: 422 }));
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ id: 'acct-2', address: 'secondaddress@public.example' }),
    );
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ token: 'token-2' }));

    const result = await createMailTmSession();

    expect(result.isErr()).toBe(false);
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        address: 'secondaddress@public.example',
        password: 'secondpassword12345',
        token: 'token-2',
        accountId: 'acct-2',
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      address: 'firstaddress@public.example',
      password: 'firstpassword1234567',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      address: 'secondaddress@public.example',
      password: 'secondpassword12345',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
      address: 'secondaddress@public.example',
      password: 'secondpassword12345',
    });
  });

  it('returns the retry error when account creation still fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        'hydra:member': [{ domain: 'public.example', isActive: true, isPrivate: false }],
      }),
    );
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, { status: 422 }));
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, { status: 503 }));

    const result = await createMailTmSession();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: 'mail-tm-request',
        status: 503,
        message: 'Mail.tm request failed with 503',
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries token creation once with the same credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        'hydra:member': [{ domain: 'public.example', isActive: true, isPrivate: false }],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ id: 'acct-1', address: 'abcdefghijkl@public.example' }),
    );
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, { status: 503 }));
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ token: 'token-1' }));

    const result = await createMailTmSession();

    expect(result.isErr()).toBe(false);
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        address: 'abcdefghijkl@public.example',
        password: 'abcdefghijklmnopqrst',
        token: 'token-1',
        accountId: 'acct-1',
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      address: 'abcdefghijkl@public.example',
      password: 'abcdefghijklmnopqrst',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
      address: 'abcdefghijkl@public.example',
      password: 'abcdefghijklmnopqrst',
    });
  });

  it('returns the retry error when token creation still fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        'hydra:member': [{ domain: 'public.example', isActive: true, isPrivate: false }],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ id: 'acct-1', address: 'abcdefghijkl@public.example' }),
    );
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, { status: 503 }));
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, { status: 401 }));

    const result = await createMailTmSession();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: 'mail-tm-request',
        status: 401,
        message: 'Mail.tm request failed with 401',
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('returns no-domain error when no eligible domains exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockJsonResponse({
        'hydra:member': [
          { domain: 'private.example', isActive: true, isPrivate: true },
          { domain: 'inactive.example', isActive: false, isPrivate: false },
        ],
      }),
    );

    const result = await createMailTmSession();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: 'mail-tm-no-domain',
        message: 'No Mail.tm domains are currently available',
      });
    }
  });

  it('lists all active public domains', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockJsonResponse({
        'hydra:member': [
          { domain: 'private.example', isActive: true, isPrivate: true },
          { domain: 'inactive.example', isActive: false, isPrivate: false },
          { domain: 'one.example', isActive: true, isPrivate: false },
          { domain: 'two.example', isActive: true, isPrivate: false },
        ],
      }),
    );

    const result = await listAvailableMailTmDomains();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(['one.example', 'two.example']);
    }
  });

  it('maps non-ok responses to request errors with status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({}, { status: 503 }));

    const result = await createMailTmSession();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: 'mail-tm-request',
        status: 503,
        message: 'Mail.tm request failed with 503',
      });
    }
  });

  it('maps invalid JSON responses to unexpected mailbox errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    } as unknown as Response);

    const result = await createMailTmSession();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: 'unexpected',
        message: 'bad json',
      });
    }
  });

  it('normalizes message summaries and details', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/messages')) {
        return mockJsonResponse({
          'hydra:member': [
            {
              id: 'msg-1',
              from: { name: '  Alice ', address: 'alice@example.com' },
              subject: '  Hello  ',
              intro: '  Preview  ',
              seen: undefined,
              hasAttachments: undefined,
            },
            { id: 'msg-2' },
          ],
        });
      }

      if (url.endsWith('/messages/msg-1')) {
        return mockJsonResponse({
          id: 'msg-1',
          from: { address: 'alice@example.com' },
          subject: '  Hello  ',
          intro: '  Preview  ',
          to: [
            { address: 'bob@example.com' },
            {},
            { address: '' },
            { address: 'carol@example.com' },
          ],
          text: '  Check https://example.com  ',
          html: ['<p>See https://example.org</p>', '<p>More</p>'],
          seen: true,
          hasAttachments: true,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const summaries = await listMailTmMessages('token');
    expect(summaries.isErr()).toBe(false);
    if (summaries.isOk()) {
      expect(summaries.value).toEqual([
        {
          id: 'msg-1',
          from: 'Alice <alice@example.com>',
          subject: 'Hello',
          intro: 'Preview',
          createdAt: '2025-01-01T00:00:00.000Z',
          seen: false,
          hasAttachments: false,
        },
        {
          id: 'msg-2',
          from: 'Unknown sender',
          subject: '(no subject)',
          intro: 'No preview available.',
          createdAt: '2025-01-01T00:00:00.000Z',
          seen: false,
          hasAttachments: false,
        },
      ]);
    }

    const detail = await getMailTmMessage('token', 'msg-1');
    expect(detail.isErr()).toBe(false);
    if (detail.isOk()) {
      expect(detail.value).toEqual({
        id: 'msg-1',
        from: 'alice@example.com',
        subject: 'Hello',
        intro: 'Preview',
        createdAt: '2025-01-01T00:00:00.000Z',
        seen: true,
        hasAttachments: true,
        to: ['bob@example.com', 'carol@example.com'],
        text: 'Check https://example.com',
        html: '<p>See https://example.org</p>\n\n<p>More</p>',
        links: [
          { label: 'example.com', url: 'https://example.com' },
          { label: 'example.org', url: 'https://example.org' },
        ],
        verification: {
          bestLink: null,
          linkCandidates: [],
          bestCode: null,
          codeCandidates: [],
        },
      });
    }

    expect(fetchMock).toHaveBeenCalled();
  });

  it('normalizes detail html when Mail.tm returns a string or null', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/messages/msg-string')) {
        return mockJsonResponse({
          id: 'msg-string',
          from: { address: 'alice@example.com' },
          text: ' hi ',
          html: '<p>Hello</p>',
        });
      }

      if (url.endsWith('/messages/msg-null')) {
        return mockJsonResponse({
          id: 'msg-null',
          from: { address: 'alice@example.com' },
          text: ' hi ',
          html: null,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const stringHtml = await getMailTmMessage('token', 'msg-string');
    const nullHtml = await getMailTmMessage('token', 'msg-null');

    expect(stringHtml.isOk()).toBe(true);
    expect(nullHtml.isOk()).toBe(true);

    if (stringHtml.isOk()) {
      expect(stringHtml.value.html).toBe('<p>Hello</p>');
    }

    if (nullHtml.isOk()) {
      expect(nullHtml.value.html).toBe('');
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('swallows delete failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await deleteMailTmAccount(session);

    expect(result.isOk()).toBe(true);
  });

  it('swallows non-ok delete responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({}, { status: 500 }));

    const result = await deleteMailTmAccount(session);

    expect(result.isOk()).toBe(true);
  });
});
