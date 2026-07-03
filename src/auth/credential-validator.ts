import axios from 'axios';
import { SPAPIError } from '../client/sp-api-client.js';
import type { GetMarketplaceParticipationsResponse } from '../types/sp-api.js';

export interface CredentialValidatorDeps {
  refreshLwaToken: () => Promise<string>;
  fetchMarketplaceParticipations: () => Promise<GetMarketplaceParticipationsResponse>;
  configuredMarketplaceId: string;
  sellerId: string;
}

export interface ValidationSuccess {
  ok: true;
  accessToken: string;
  participatingMarketplaceIds: string[];
  configuredMarketplaceValid: boolean;
}

export type ValidationResult = ValidationSuccess | { ok: false; error: string };

function extractLwaErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; error_description?: string } | undefined;
    if (data?.error_description) {
      const code = data.error ? ` (${data.error})` : '';
      return `${data.error_description}${code}`;
    }
    if (data?.error) {
      return data.error;
    }
    if (err.response?.status) {
      return `HTTP ${err.response.status}: ${err.message}`;
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function formatSpApiError(err: SPAPIError): string {
  const code = err.statusCode ?? 'unknown';
  const base = `SP-API rejected the access token (HTTP ${code}): ${err.message}`;
  if (err.details && !err.message.includes(err.details)) {
    return `${base} (${err.details})`;
  }
  return base;
}

export async function validateCredentials(deps: CredentialValidatorDeps): Promise<ValidationResult> {
  let accessToken: string;
  try {
    accessToken = await deps.refreshLwaToken();
  } catch (err) {
    return { ok: false, error: `LWA validation failed: ${extractLwaErrorMessage(err)}` };
  }

  let participations: GetMarketplaceParticipationsResponse;
  try {
    participations = await deps.fetchMarketplaceParticipations();
  } catch (err) {
    if (err instanceof SPAPIError) {
      return { ok: false, error: formatSpApiError(err) };
    }
    return { ok: false, error: `SP-API call failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const participatingMarketplaceIds = (participations.payload ?? [])
    .filter((entry) => entry.participation?.isParticipating === true)
    .map((entry) => entry.marketplace.id);

  if (!participatingMarketplaceIds.includes(deps.configuredMarketplaceId)) {
    return {
      ok: false,
      error:
        `Configured MARKETPLACE_ID "${deps.configuredMarketplaceId}" is not in this seller's ` +
        `participating marketplaces: [${participatingMarketplaceIds.join(', ')}]. ` +
        `Pick one of those.`,
    };
  }

  return {
    ok: true,
    accessToken,
    participatingMarketplaceIds,
    configuredMarketplaceValid: true,
  };
}
