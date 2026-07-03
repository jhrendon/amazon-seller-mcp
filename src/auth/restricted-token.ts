import { getSPAPIClient } from '../client/sp-api-client.js';
import type {
  CreateRestrictedDataTokenResponse,
  RestrictedResource,
} from '../types/sp-api.js';

/**
 * Create a restricted data token (RDT) for accessing PII on specific SP-API paths.
 */
export async function createRestrictedDataToken(
  resources: RestrictedResource[]
): Promise<CreateRestrictedDataTokenResponse> {
  const client = getSPAPIClient();
  return client.post<CreateRestrictedDataTokenResponse>(
    '/tokens/2021-03-01/restrictedDataToken',
    { restrictedResources: resources },
    { rateLimitCategory: 'tokens' }
  );
}
