import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { TokenManager } from '../src/auth/token-manager.js';

const config = {
  LWA_REFRESH_TOKEN: 'refresh-token',
  LWA_CLIENT_ID: 'client-id',
  LWA_CLIENT_SECRET: 'client-secret',
};

vi.mock('../src/config/index.js', () => ({
  getConfig: vi.fn(() => config),
}));

describe('TokenManager', () => {
  let manager: TokenManager;
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new TokenManager();
    postSpy = vi.spyOn(axios, 'post').mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns a cached token without refreshing while it is still valid', async () => {
    postSpy.mockResolvedValueOnce({ data: { access_token: 'token-1', expires_in: 3600 } });

    const first = await manager.getAccessToken();
    expect(first).toBe('token-1');
    expect(postSpy).toHaveBeenCalledTimes(1);

    // Advance well within the 5-minute pre-expiry buffer
    vi.advanceTimersByTime(60_000);

    const second = await manager.getAccessToken();
    expect(second).toBe('token-1');
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token on cache miss', async () => {
    postSpy.mockResolvedValueOnce({ data: { access_token: 'token-2', expires_in: 3600 } });

    const token = await manager.getAccessToken();
    expect(token).toBe('token-2');
    expect(postSpy).toHaveBeenCalledTimes(1);

    const [url, params] = postSpy.mock.calls[0];
    expect(url).toBe('https://api.amazon.com/auth/o2/token');
    expect((params as URLSearchParams).get('grant_type')).toBe('refresh_token');
    expect((params as URLSearchParams).get('refresh_token')).toBe('refresh-token');
    expect((params as URLSearchParams).get('client_id')).toBe('client-id');
    expect((params as URLSearchParams).get('client_secret')).toBe('client-secret');
  });

  it('deduplicates concurrent refresh attempts into a single LWA POST', async () => {
    let resolvePost: ((value: { data: { access_token: string; expires_in: number } }) => void) | undefined;

    postSpy.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        })
    );

    const p1 = manager.getAccessToken();
    const p2 = manager.getAccessToken();
    const p3 = manager.getAccessToken();

    // Only one network call should have started before the promise resolves
    expect(postSpy).toHaveBeenCalledTimes(1);

    resolvePost!({ data: { access_token: 'token-3', expires_in: 3600 } });

    const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
    expect(t1).toBe('token-3');
    expect(t2).toBe('token-3');
    expect(t3).toBe('token-3');
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('clearCache forces a fresh token request', async () => {
    postSpy
      .mockResolvedValueOnce({ data: { access_token: 'token-4', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { access_token: 'token-5', expires_in: 3600 } });

    const first = await manager.getAccessToken();
    expect(first).toBe('token-4');

    manager.clearCache();

    const second = await manager.getAccessToken();
    expect(second).toBe('token-5');
    expect(postSpy).toHaveBeenCalledTimes(2);
  });
});
