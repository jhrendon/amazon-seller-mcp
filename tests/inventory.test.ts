import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerInventoryTools } from '../src/tools/inventory.js';
import { setParticipatingMarketplaceIds } from '../src/tools/_shared/marketplace.js';
import type { InventorySummary } from '../src/types/sp-api.js';

const getMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({ get: getMock }),
}));

function makeServer() {
  const tools: Record<string, { handler: (input: unknown) => Promise<unknown>; schema: unknown }> = {};
  const server = {
    registerTool: (name: string, opts: { inputSchema: unknown }, handler: (input: unknown) => Promise<unknown>) => {
      tools[name] = { handler, schema: opts.inputSchema };
      return server;
    },
  };
  return { server, tools };
}

function makeInventorySummary(
  partial: Partial<InventorySummary> & { asin: string; sellerSku: string }
): InventorySummary {
  return {
    asin: partial.asin,
    sellerSku: partial.sellerSku,
    fnSku: partial.fnSku ?? 'X00000000',
    productName: partial.productName ?? 'Test Product',
    condition: partial.condition ?? 'New',
    totalQuantity: partial.totalQuantity ?? 0,
    lastUpdatedTime: partial.lastUpdatedTime ?? '2025-01-01T00:00:00Z',
    inventoryDetails: partial.inventoryDetails,
    ...partial,
  };
}

describe('inventory tools', () => {
  beforeEach(() => {
    getMock.mockReset();
    setParticipatingMarketplaceIds(['ATVPDKIKX0DER']);
  });

  describe('get_inventory_summary', () => {
    it('maps inventory fields and passes the marketplace param', async () => {
      getMock.mockResolvedValueOnce({
        payload: {
          granularity: { granularityType: 'Marketplace', granularityId: 'ATVPDKIKX0DER' },
          inventorySummaries: [
            makeInventorySummary({
              asin: 'B001',
              sellerSku: 'SKU-1',
              totalQuantity: 10,
              inventoryDetails: {
                fulfillableQuantity: 5,
                inboundWorkingQuantity: 1,
                inboundShippedQuantity: 1,
                inboundReceivingQuantity: 1,
                reservedQuantity: { totalReservedQuantity: 1 },
                unfulfillableQuantity: { totalUnfulfillableQuantity: 1 },
              },
            }),
          ],
        },
        pagination: { nextToken: 'tok-1' },
      });

      const { server, tools } = makeServer();
      registerInventoryTools(server);
      const result = (await tools['get_inventory_summary'].handler({
        sellerSkus: ['SKU-1'],
        marketplaceId: 'ATVPDKIKX0DER',
      })) as {
        structuredContent: {
          totalSkus: number;
          hasMore: boolean;
          nextToken: string;
          inventory: Array<{
            asin: string;
            sellerSku: string;
            fulfillableQuantity: number;
            inboundShipped: number;
            reserved: number;
            unfulfillable: number;
          }>;
        };
      };

      expect(getMock).toHaveBeenCalledWith(
        '/fba/inventory/v1/summaries',
        expect.objectContaining({
          granularityType: 'Marketplace',
          granularityId: 'ATVPDKIKX0DER',
          marketplaceIds: 'ATVPDKIKX0DER',
          sellerSkus: 'SKU-1',
          details: true,
        }),
        expect.objectContaining({ rateLimitCategory: 'inventory' })
      );
      expect(result.structuredContent.totalSkus).toBe(1);
      expect(result.structuredContent.hasMore).toBe(true);
      expect(result.structuredContent.nextToken).toBe('tok-1');
      expect(result.structuredContent.inventory[0]).toMatchObject({
        asin: 'B001',
        sellerSku: 'SKU-1',
        fulfillableQuantity: 5,
        inboundShipped: 1,
        reserved: 1,
        unfulfillable: 1,
      });
    });
  });

  describe('get_fba_inventory_details', () => {
    it('filters results by ASIN', async () => {
      getMock.mockResolvedValueOnce({
        payload: {
          granularity: { granularityType: 'Marketplace', granularityId: 'ATVPDKIKX0DER' },
          inventorySummaries: [
            makeInventorySummary({ asin: 'B001', sellerSku: 'SKU-1' }),
            makeInventorySummary({ asin: 'B002', sellerSku: 'SKU-2' }),
          ],
        },
      });

      const { server, tools } = makeServer();
      registerInventoryTools(server);
      const result = (await tools['get_fba_inventory_details'].handler({
        asin: 'B001',
      })) as {
        structuredContent: {
          totalItems: number;
          inventoryDetails: Array<{ asin: string; sellerSku: string }>;
        };
      };

      expect(result.structuredContent.totalItems).toBe(1);
      expect(result.structuredContent.inventoryDetails[0].asin).toBe('B001');
      expect(result.structuredContent.inventoryDetails[0].sellerSku).toBe('SKU-1');
    });
  });
});
