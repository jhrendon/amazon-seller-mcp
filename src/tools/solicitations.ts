import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { SPAPIError } from '../client/sp-api-client.js';
import { orderIdSchema, marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import { makeToolResponse } from './_shared/response.js';
import type { GetOrderResponse, SolicitationActionsResponse, SolicitationResponse } from '../types/sp-api.js';

const getSolicitationActionsForOrderSchema = z.object({
  orderId: orderIdSchema,
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const requestProductReviewSchema = z.object({
  orderId: orderIdSchema,
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

export function registerSolicitationsTools(server: McpServer): void {
  server.registerTool(
    'get_solicitation_actions_for_order',
    {
      description:
        'Discover which buyer solicitation actions are available for an order (e.g., productReviewAndSellerFeedback). Returns an empty actions array if the order is not yet eligible (e.g., not yet shipped).',
      inputSchema: getSolicitationActionsForOrderSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const response = await client.get<SolicitationActionsResponse>(
        `/messaging/v1/orders/${encodeURIComponent(input.orderId)}/solicitation/actions`,
        undefined,
        { rateLimitCategory: 'solicitations' }
      );

      const payload = {
        orderId: input.orderId,
        actions: response.actions ?? [],
      };

      return makeToolResponse(payload);
    }
  );

  server.registerTool(
    'request_product_review',
    {
      description:
        'Request a product review from the buyer of a delivered order. The order must be in `Shipped` status — the tool validates this client-side first. Returns 200 on success, or a clear refusal if the order is not yet shipped.',
      inputSchema: requestProductReviewSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      let order: GetOrderResponse;
      try {
        order = await client.get<GetOrderResponse>(
          `/orders/v0/orders/${encodeURIComponent(input.orderId)}`,
          undefined,
          { rateLimitCategory: 'orders' }
        );
      } catch (err) {
        if (err instanceof SPAPIError) throw err;
        throw err;
      }

      const orderStatus = order?.payload?.OrderStatus;
      if (orderStatus !== 'Shipped') {
        const refusal = {
          orderId: input.orderId,
          orderStatus,
          message: `Order is in status "${orderStatus}" — can only request a review after shipment.`,
          sent: false,
        };
        return makeToolResponse(refusal);
      }

      const response = await client.post<SolicitationResponse>(
        `/messaging/v1/orders/${encodeURIComponent(input.orderId)}/solicitations/productReviewAndSellerFeedback`,
        {},
        { rateLimitCategory: 'solicitations' }
      );

      const payload = {
        orderId: input.orderId,
        sent: true,
        response,
      };

      return makeToolResponse(payload);
    }
  );
}
