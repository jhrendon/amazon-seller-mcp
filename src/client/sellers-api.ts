import { getSPAPIClient } from './sp-api-client.js';
import type { GetMarketplaceParticipationsResponse } from '../types/sp-api.js';

export async function fetchMarketplaceParticipations(): Promise<GetMarketplaceParticipationsResponse> {
  return getSPAPIClient().get<GetMarketplaceParticipationsResponse>(
    '/sellers/v1/marketplaceParticipations',
    undefined,
    { rateLimitCategory: 'default' }
  );
}
