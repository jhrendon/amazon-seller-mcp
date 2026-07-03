import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import { makeToolResponse } from './_shared/response.js';
import type { FeedbackInsightsResponse } from '../types/sp-api.js';

const getFeedbackInsightsForAsinSchema = z.object({
  asin: z.string().min(1).describe('The ASIN to fetch feedback insights for'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const getFeedbackInsightsForBrowseNodeSchema = z.object({
  browseNodeId: z.string().min(1).describe('The browse node (category) ID'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

export function registerFeedbackTools(server: McpServer): void {
  server.registerTool(
    'get_feedback_insights_for_asin',
    {
      description:
        'Get item-level customer feedback insights (rating distribution and theme counts) for a single ASIN. Requires the seller to have Brand Registry for the marketplace; a 403 is surfaced verbatim if Brand Registry is missing.',
      inputSchema: getFeedbackInsightsForAsinSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const response = await client.get<FeedbackInsightsResponse>(
        `/customerFeedback/2024-06-01/items/${encodeURIComponent(input.asin)}/insights`,
        { marketplaceId },
        { rateLimitCategory: 'customerFeedback' }
      );

      const payload = response?.insights?.length
        ? response
        : { insights: [] as FeedbackInsightsResponse['insights'] };

      return makeToolResponse(payload);
    }
  );

  server.registerTool(
    'get_feedback_insights_for_browse_node',
    {
      description:
        'Get aggregated customer feedback insights (rating distribution and theme counts) for a browse node (category). Requires Brand Registry for the marketplace.',
      inputSchema: getFeedbackInsightsForBrowseNodeSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const response = await client.get<FeedbackInsightsResponse>(
        `/customerFeedback/2024-06-01/browseNodes/${encodeURIComponent(input.browseNodeId)}/insights`,
        { marketplaceId },
        { rateLimitCategory: 'customerFeedback' }
      );

      return makeToolResponse(response);
    }
  );
}
