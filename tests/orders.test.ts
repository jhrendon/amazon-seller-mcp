import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerOrderTools } from '../src/tools/orders.js';
import { setParticipatingMarketplaceIds } from '../src/tools/_shared/marketplace.js';
import type { Order, OrderItem } from '../src/types/sp-api.js';

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

function makeOrder(partial: Partial<Order> & { AmazonOrderId: string }): Order {
  return {
    AmazonOrderId: partial.AmazonOrderId,
    PurchaseDate: partial.PurchaseDate ?? '2025-01-01T00:00:00Z',
    LastUpdateDate: partial.LastUpdateDate ?? '2025-01-01T00:00:00Z',
    OrderStatus: partial.OrderStatus ?? 'Shipped',
    FulfillmentChannel: partial.FulfillmentChannel ?? 'AFN',
    MarketplaceId: partial.MarketplaceId ?? 'ATVPDKIKX0DER',
    ...partial,
  };
}

describe('orders tools', () => {
  beforeEach(() => {
    getMock.mockReset();
    setParticipatingMarketplaceIds(['ATVPDKIKX0DER']);
  });

  describe('get_orders', () => {
    it('paginates through orders up to maxResults and passes the marketplace param', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) =>
        makeOrder({ AmazonOrderId: `111-${String(i).padStart(7, '0')}-0000001` })
      );
      const page2 = Array.from({ length: 60 }, (_, i) =>
        makeOrder({ AmazonOrderId: `222-${String(i).padStart(7, '0')}-0000001` })
      );

      getMock
        .mockResolvedValueOnce({ payload: { Orders: page1, NextToken: 'tok-1' } })
        .mockResolvedValueOnce({ payload: { Orders: page2 } });

      const { server, tools } = makeServer();
      registerOrderTools(server);
      const result = (await tools['get_orders'].handler({
        createdAfter: '2025-01-01T00:00:00Z',
        maxResults: 150,
        marketplaceId: 'ATVPDKIKX0DER',
      })) as {
        structuredContent: { totalOrders: number; pagesFetched: number; hasMore: boolean };
      };

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(getMock.mock.calls[0][1]).toMatchObject({
        MarketplaceIds: 'ATVPDKIKX0DER',
        MaxResultsPerPage: 100,
        CreatedAfter: '2025-01-01T00:00:00Z',
      });
      expect(getMock.mock.calls[1][1]).toMatchObject({
        MarketplaceIds: 'ATVPDKIKX0DER',
        MaxResultsPerPage: 50,
        NextToken: 'tok-1',
      });
      expect(result.structuredContent.totalOrders).toBe(150);
      expect(result.structuredContent.pagesFetched).toBe(2);
      expect(result.structuredContent.hasMore).toBe(false);
    });

    it('rejects an invalid marketplaceId when participations are set', async () => {
      const { server, tools } = makeServer();
      registerOrderTools(server);

      await expect(
        tools['get_orders'].handler({ marketplaceId: 'INVALID' })
      ).rejects.toThrow(/not in this seller's participating marketplaces/);
    });
  });

  describe('get_order_items', () => {
    it('follows NextToken through multiple pages', async () => {
      const items1: OrderItem[] = [
        { OrderItemId: 'oi-1', ASIN: 'B001', QuantityOrdered: 1 },
      ];
      const items2: OrderItem[] = [
        { OrderItemId: 'oi-2', ASIN: 'B002', QuantityOrdered: 2 },
      ];

      getMock
        .mockResolvedValueOnce({
          payload: { OrderItems: items1, NextToken: 'tok-items', AmazonOrderId: '111-1234567-1234567' },
        })
        .mockResolvedValueOnce({
          payload: { OrderItems: items2, AmazonOrderId: '111-1234567-1234567' },
        });

      const { server, tools } = makeServer();
      registerOrderTools(server);
      const result = (await tools['get_order_items'].handler({
        orderId: '111-1234567-1234567',
      })) as {
        structuredContent: { totalItems: number; orderId: string };
      };

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(getMock.mock.calls[1][1]).toMatchObject({ NextToken: 'tok-items' });
      expect(result.structuredContent.totalItems).toBe(2);
      expect(result.structuredContent.orderId).toBe('111-1234567-1234567');
    });
  });

  describe('get_order_details', () => {
    it('uses the restrictedDataToken when provided', async () => {
      getMock.mockResolvedValueOnce({
        payload: makeOrder({ AmazonOrderId: '111-1234567-1234567', OrderStatus: 'Shipped' }),
      });

      const { server, tools } = makeServer();
      registerOrderTools(server);
      await tools['get_order_details'].handler({
        orderId: '111-1234567-1234567',
        restrictedDataToken: 'rdt-xyz',
      });

      expect(getMock).toHaveBeenCalledWith(
        '/orders/v0/orders/111-1234567-1234567',
        undefined,
        expect.objectContaining({ rateLimitCategory: 'orders', accessToken: 'rdt-xyz' })
      );
    });

    it('does not send an accessToken option when no RDT is provided', async () => {
      getMock.mockResolvedValueOnce({
        payload: makeOrder({ AmazonOrderId: '111-1234567-1234567' }),
      });

      const { server, tools } = makeServer();
      registerOrderTools(server);
      await tools['get_order_details'].handler({ orderId: '111-1234567-1234567' });

      expect(getMock).toHaveBeenCalledWith(
        '/orders/v0/orders/111-1234567-1234567',
        undefined,
        expect.objectContaining({ rateLimitCategory: 'orders' })
      );
      const options = getMock.mock.calls[0][2] as { accessToken?: string };
      expect(options.accessToken).toBeUndefined();
    });
  });
});
