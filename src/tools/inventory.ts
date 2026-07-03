import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import type { GetInventorySummariesResponse } from '../types/sp-api.js';

// Input schemas
const getInventorySummarySchema = z.object({
  sellerSkus: z
    .array(z.string())
    .optional()
    .describe('Filter by specific seller SKUs (max 50)'),
  nextToken: z.string().optional().describe('Pagination token for next page of results'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const getFbaInventorySchema = z.object({
  sellerSku: z.string().optional().describe('Filter by specific seller SKU'),
  asin: z.string().optional().describe('Filter by specific ASIN'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

export function registerInventoryTools(server: McpServer): void {
  server.registerTool(
    'get_inventory_summary',
    {
      description:
        'Get FBA inventory summary including quantity available, reserved, inbound, and unfulfillable. Shows inventory health at a glance for all or specific SKUs.',
      inputSchema: getInventorySummarySchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const queryParams: Record<string, unknown> = {
        granularityType: 'Marketplace',
        granularityId: marketplaceId,
        marketplaceIds: marketplaceId,
        details: true,
      };

      if (input.sellerSkus && input.sellerSkus.length > 0) {
        queryParams.sellerSkus = input.sellerSkus.slice(0, 50).join(',');
      }

      if (input.nextToken) {
        queryParams.nextToken = input.nextToken;
      }

      const response = await client.get<GetInventorySummariesResponse>(
        '/fba/inventory/v1/summaries',
        queryParams,
        { rateLimitCategory: 'inventory' }
      );

      const summaries = response.payload.inventorySummaries || [];

      const summary = {
        totalSkus: summaries.length,
        hasMore: !!response.pagination?.nextToken,
        nextToken: response.pagination?.nextToken,
        inventory: summaries.map((item) => ({
          asin: item.asin,
          fnSku: item.fnSku,
          sellerSku: item.sellerSku,
          productName: item.productName,
          condition: item.condition,
          totalQuantity: item.totalQuantity,
          fulfillableQuantity: item.inventoryDetails?.fulfillableQuantity || 0,
          inboundWorking: item.inventoryDetails?.inboundWorkingQuantity || 0,
          inboundShipped: item.inventoryDetails?.inboundShippedQuantity || 0,
          inboundReceiving: item.inventoryDetails?.inboundReceivingQuantity || 0,
          reserved: item.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0,
          unfulfillable:
            item.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity || 0,
          lastUpdated: item.lastUpdatedTime,
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    }
  );

  server.registerTool(
    'get_fba_inventory_details',
    {
      description:
        'Get detailed FBA inventory information including breakdown of reserved quantities, unfulfillable reasons, and researching quantities. Provides deeper insight into inventory status.',
      inputSchema: getFbaInventorySchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const queryParams: Record<string, unknown> = {
        granularityType: 'Marketplace',
        granularityId: marketplaceId,
        marketplaceIds: marketplaceId,
        details: true,
      };

      if (input.sellerSku) {
        queryParams.sellerSkus = input.sellerSku;
      }

      const response = await client.get<GetInventorySummariesResponse>(
        '/fba/inventory/v1/summaries',
        queryParams,
        { rateLimitCategory: 'inventory' }
      );

      const summaries = response.payload.inventorySummaries || [];

      // Filter by ASIN if provided
      const filtered = input.asin
        ? summaries.filter((item) => item.asin === input.asin)
        : summaries;

      const summary = {
        totalItems: filtered.length,
        inventoryDetails: filtered.map((item) => ({
          asin: item.asin,
          fnSku: item.fnSku,
          sellerSku: item.sellerSku,
          productName: item.productName,
          condition: item.condition,
          totalQuantity: item.totalQuantity,
          lastUpdated: item.lastUpdatedTime,
          details: {
            fulfillable: item.inventoryDetails?.fulfillableQuantity || 0,
            inbound: {
              working: item.inventoryDetails?.inboundWorkingQuantity || 0,
              shipped: item.inventoryDetails?.inboundShippedQuantity || 0,
              receiving: item.inventoryDetails?.inboundReceivingQuantity || 0,
            },
            reserved: {
              total: item.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0,
              pendingCustomerOrder:
                item.inventoryDetails?.reservedQuantity?.pendingCustomerOrderQuantity || 0,
              pendingTransshipment:
                item.inventoryDetails?.reservedQuantity?.pendingTransshipmentQuantity || 0,
              fcProcessing:
                item.inventoryDetails?.reservedQuantity?.fcProcessingQuantity || 0,
            },
            unfulfillable: {
              total:
                item.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity ||
                0,
              customerDamaged:
                item.inventoryDetails?.unfulfillableQuantity?.customerDamagedQuantity || 0,
              warehouseDamaged:
                item.inventoryDetails?.unfulfillableQuantity?.warehouseDamagedQuantity || 0,
              distributorDamaged:
                item.inventoryDetails?.unfulfillableQuantity?.distributorDamagedQuantity ||
                0,
              carrierDamaged:
                item.inventoryDetails?.unfulfillableQuantity?.carrierDamagedQuantity || 0,
              defective:
                item.inventoryDetails?.unfulfillableQuantity?.defectiveQuantity || 0,
              expired: item.inventoryDetails?.unfulfillableQuantity?.expiredQuantity || 0,
            },
            researching: {
              total:
                item.inventoryDetails?.researchingQuantity?.totalResearchingQuantity || 0,
              breakdown:
                item.inventoryDetails?.researchingQuantity?.researchingQuantityBreakdown ||
                [],
            },
          },
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    }
  );
}
