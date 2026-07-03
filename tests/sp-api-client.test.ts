import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { SPAPIClient, SPAPIError } from '../src/client/sp-api-client.js';

const requestMock = vi.fn();
const clearCacheMock = vi.fn();
const getAccessTokenMock = vi.fn().mockResolvedValue('token-abc');

vi.mock('../src/config/index.js', () => ({
  getConfig: () => ({
    SP_API_ENDPOINT: 'https://api.example.com',
  }),
}));

vi.mock('../src/auth/token-manager.js', () => ({
  getTokenManager: () => ({
    getAccessToken: getAccessTokenMock,
    clearCache: clearCacheMock,
  }),
}));

interface FakeAxiosError {
  isAxiosError: true;
  response?: { status: number; data?: unknown };
  code?: string;
  message: string;
}

function makeAxiosError(status?: number, data?: unknown, code?: string): FakeAxiosError {
  const err: FakeAxiosError = {
    isAxiosError: true,
    message: 'Request failed',
  };
  if (status !== undefined) {
    err.response = { status, data };
  }
  if (code !== undefined) {
    err.code = code;
  }
  return err;
}

function createFakeAxiosInstance() {
  let requestInterceptor: ((cfg: unknown) => unknown | Promise<unknown>) | undefined;

  return {
    interceptors: {
      request: {
        use: (handler: unknown) => {
          requestInterceptor = handler as (cfg: unknown) => unknown | Promise<unknown>;
        },
      },
    },
    request: async (config: unknown) => {
      const cfg = config as { headers?: Record<string, string> };
      if (!cfg.headers) {
        cfg.headers = {};
      }
      let finalConfig: unknown = cfg;
      if (requestInterceptor) {
        finalConfig = await requestInterceptor(cfg);
      }
      return requestMock(finalConfig);
    },
  };
}

describe('SPAPIClient resilience', () => {
  beforeEach(() => {
    requestMock.mockReset();
    clearCacheMock.mockReset();
    getAccessTokenMock.mockResolvedValue('token-abc');
    vi.spyOn(axios, 'create').mockReturnValue(createFakeAxiosInstance() as ReturnType<typeof axios.create>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes the token and retries once on HTTP 401', async () => {
    requestMock
      .mockRejectedValueOnce(makeAxiosError(401, { errors: [{ message: 'Unauthorized' }] }))
      .mockResolvedValueOnce({ data: { ok: true } });

    const client = new SPAPIClient();
    const result = await client.get('/test', undefined, { retryDelay: 1 });

    expect(result).toEqual({ ok: true });
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it('throws the final error when the 401 retry also fails', async () => {
    requestMock
      .mockRejectedValueOnce(makeAxiosError(401, { errors: [{ message: 'Unauthorized' }] }))
      .mockRejectedValueOnce(makeAxiosError(403, { errors: [{ message: 'Forbidden' }] }));

    const client = new SPAPIClient();
    let caught: unknown;
    try {
      await client.get('/test', undefined, { retryDelay: 1 });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SPAPIError);
    expect((caught as SPAPIError).statusCode).toBe(403);
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it('does not clear the token cache for HTTP 403', async () => {
    requestMock.mockRejectedValueOnce(
      makeAxiosError(403, { errors: [{ message: 'Forbidden', details: 'Missing role' }] })
    );

    const client = new SPAPIClient();
    await expect(client.get('/test', undefined, { retryDelay: 1 })).rejects.toThrow(SPAPIError);

    expect(clearCacheMock).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('retries requests aborted by the explicit axios timeout', async () => {
    requestMock
      .mockRejectedValueOnce(makeAxiosError(undefined, undefined, 'ECONNABORTED'))
      .mockResolvedValueOnce({ data: { ok: true } });

    const client = new SPAPIClient();
    const result = await client.get('/test', undefined, { retryDelay: 1 });

    expect(result).toEqual({ ok: true });
    expect(clearCacheMock).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledTimes(2);
  });
});
