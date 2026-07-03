import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { validateCredentials, type CredentialValidatorDeps } from '../src/auth/credential-validator.js';
import { SPAPIError } from '../src/client/sp-api-client.js';
import type { GetMarketplaceParticipationsResponse } from '../src/types/sp-api.js';

function makeDeps(overrides: Partial<CredentialValidatorDeps> = {}): CredentialValidatorDeps {
  return {
    refreshLwaToken: vi.fn().mockResolvedValue('access-token-abc'),
    fetchMarketplaceParticipations: vi.fn().mockResolvedValue({
      payload: [
        { marketplace: { id: 'ATVPDKIKX0DER', name: 'US' }, participation: { isParticipating: true } },
      ],
    } satisfies GetMarketplaceParticipationsResponse),
    configuredMarketplaceId: 'ATVPDKIKX0DER',
    sellerId: 'SELLER123',
    ...overrides,
  };
}

describe('validateCredentials', () => {
  it('returns ok with the token and participating marketplace IDs on the happy path', async () => {
    const deps = makeDeps();

    const result = await validateCredentials(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accessToken).toBe('access-token-abc');
    expect(result.participatingMarketplaceIds).toEqual(['ATVPDKIKX0DER']);
    expect(result.configuredMarketplaceValid).toBe(true);
    expect(deps.refreshLwaToken).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarketplaceParticipations).toHaveBeenCalledTimes(1);
  });

  it('returns a failure result with the LWA error_description when the refresh token is expired', async () => {
    const axiosError = new Error('Request failed') as Error & {
      isAxiosError: true;
      response: { status: number; data: { error: string; error_description: string } };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      status: 400,
      data: { error: 'invalid_grant', error_description: 'Refresh Token has expired' },
    };
    vi.spyOn(axios, 'isAxiosError').mockReturnValueOnce(true);

    const deps = makeDeps({
      refreshLwaToken: vi.fn().mockRejectedValue(axiosError),
    });

    const result = await validateCredentials(deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('LWA validation failed');
    expect(result.error).toContain('Refresh Token has expired');
  });

  it('returns a failure result identifying the SP-API 401 when the access token is rejected', async () => {
    const spApiError = new SPAPIError(
      'Authentication failed. Please check your LWA credentials.',
      401,
      'UNAUTHORIZED',
      false
    );

    const deps = makeDeps({
      fetchMarketplaceParticipations: vi.fn().mockRejectedValue(spApiError),
    });

    const result = await validateCredentials(deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('SP-API rejected');
    expect(result.error).toContain('401');
  });

  it('returns a failure result that includes the SP-API details string on a 403', async () => {
    const spApiError = new SPAPIError('Forbidden', 403, 'FORBIDDEN', false, 'User not enrolled');

    const deps = makeDeps({
      fetchMarketplaceParticipations: vi.fn().mockRejectedValue(spApiError),
    });

    const result = await validateCredentials(deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('403');
    expect(result.error).toContain('User not enrolled');
  });

  it('returns a failure result listing the valid marketplace IDs when the configured one is not participating', async () => {
    const deps = makeDeps({
      configuredMarketplaceId: 'WRONGID',
      fetchMarketplaceParticipations: vi.fn().mockResolvedValue({
        payload: [
          { marketplace: { id: 'A1F83G8C2ARO7P', name: 'UK' }, participation: { isParticipating: true } },
          { marketplace: { id: 'A1PA6795UKMFR9', name: 'DE' }, participation: { isParticipating: true } },
          { marketplace: { id: 'A13V1IB3VIYBER', name: 'FR' }, participation: { isParticipating: true } },
        ],
      } satisfies GetMarketplaceParticipationsResponse),
    });

    const result = await validateCredentials(deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('WRONGID');
    expect(result.error).toContain('A1F83G8C2ARO7P');
    expect(result.error).toContain('A1PA6795UKMFR9');
    expect(result.error).toContain('A13V1IB3VIYBER');
  });

  it('excludes marketplaces where isParticipating is false from the participating IDs on the success path', async () => {
    const deps = makeDeps({
      configuredMarketplaceId: 'ATVPDKIKX0DER',
      fetchMarketplaceParticipations: vi.fn().mockResolvedValue({
        payload: [
          { marketplace: { id: 'ATVPDKIKX0DER', name: 'US' }, participation: { isParticipating: true } },
          { marketplace: { id: 'A19VAU5U5O7RUS', name: 'SG' }, participation: { isParticipating: false } },
        ],
      } satisfies GetMarketplaceParticipationsResponse),
    });

    const result = await validateCredentials(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.participatingMarketplaceIds).toEqual(['ATVPDKIKX0DER']);
    expect(result.participatingMarketplaceIds).not.toContain('A19VAU5U5O7RUS');
  });
});
