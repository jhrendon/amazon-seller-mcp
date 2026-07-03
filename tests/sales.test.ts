import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSalesTools } from '../src/tools/sales.js';
import { setParticipatingMarketplaceIds } from '../src/tools/_shared/marketplace.js';
import type { Order } from '../src/types/sp-api.js';

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

describe('sales tools', () => {
  beforeEach(() => {
    getMock.mockReset();
    setParticipatingMarketplaceIds(['ATVPDKIKX0DER']);
  });

  describe('get_sales_metrics', () => {
    it('returns totals and passes the marketplace param', async () => {
      getMock.mockResolvedValueOnce({
        payload: [
          {
            interval: '2025-01-01T00:00:00Z--2025-01-01T23:59:59Z',
            unitCount: 5,
            orderCount: 2,
            orderItemCount: 6,
            averageUnitPrice: { currencyCode: 'USD', amount: '10.00' },
            totalSales: { currencyCode: 'USD', amount: '50.00' },
          },
          {
            interval: '2025-01-02T00:00:00Z--2025-01-02T23:59:59Z',
            unitCount: 3,
            orderCount: 1,
            orderItemCount: 3,
            averageUnitPrice: { currencyCode: 'USD', amount: '12.00' },
            totalSales: { currencyCode: 'USD', amount: '36.00' },
          },
        ],
      });

      const { server, tools } = makeServer();
      registerSalesTools(server);
      const result = (await tools['get_sales_metrics'].handler({
        startDate: '2025-01-01',
        endDate: '2025-01-02',
        interval: 'Day',
        marketplaceId: 'ATVPDKIKX0DER',
      })) as {
        structuredContent: {
          summary: {
            totalUnits: number;
            totalOrders: number;
            totalSales: { amount: string };
          };
          dataPoints: number;
        };
      };

      expect(getMock).toHaveBeenCalledWith(
        '/sales/v1/orderMetrics',
        expect.objectContaining({
          marketplaceIds: 'ATVPDKIKX0DER',
          interval: expect.stringContaining('2025-01-01T00:00:00Z--2025-01-02T23:59:59Z'),
          granularity: 'Day',
        }),
        expect.objectContaining({ rateLimitCategory: 'sales' })
      );
      expect(result.structuredContent.summary.totalUnits).toBe(8);
      expect(result.structuredContent.summary.totalOrders).toBe(3);
      expect(result.structuredContent.summary.totalSales.amount).toBe('86.00');
      expect(result.structuredContent.dataPoints).toBe(2);
    });
  });

  describe('get_sales_summary', () => {
    it('counts only NumberOfItemsShipped and returns a daily breakdown', async () => {
      const orders: Order[] = [
        makeOrder({
          AmazonOrderId: '111-0000001-0000001',
          PurchaseDate: '2025-01-01T10:00:00Z',
          OrderStatus: 'Shipped',
          NumberOfItemsShipped: 2,
          NumberOfItemsUnshipped: 5,
          OrderTotal: { CurrencyCode: 'USD', Amount: '50.00' },
        }),
        makeOrder({
          AmazonOrderId: '111-0000002-0000002',
          PurchaseDate: '2025-01-01T12:00:00Z',
          OrderStatus: 'Unshipped',
          NumberOfItemsShipped: 0,
          NumberOfItemsUnshipped: 1,
          OrderTotal: { CurrencyCode: 'USD', Amount: '20.00' },
        }),
        makeOrder({
          AmazonOrderId: '111-0000003-0000003',
          PurchaseDate: '2025-01-02T08:00:00Z',
          OrderStatus: 'Shipped',
          NumberOfItemsShipped: 3,
          NumberOfItemsUnshipped: 0,
          OrderTotal: { CurrencyCode: 'USD', Amount: '75.00' },
        }),
      ];

      getMock.mockResolvedValueOnce({ payload: { Orders: orders } });

      const { server, tools } = makeServer();
      registerSalesTools(server);
      const result = (await tools['get_sales_summary'].handler({
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      })) as {
        structuredContent: {
          summary: {
            totalOrders: number;
            totalUnits: number;
            totalSales: { amount: string };
          };
          dailyBreakdown: Array<{ date: string; sales: string; orders: number; units: number }>;
        };
      };

      // Only the two shipped orders count; unshipped units are ignored
      expect(result.structuredContent.summary.totalOrders).toBe(2);
      expect(result.structuredContent.summary.totalUnits).toBe(5);
      expect(result.structuredContent.summary.totalSales.amount).toBe('125.00');
      expect(result.structuredContent.dailyBreakdown).toEqual([
        { date: '2025-01-01', sales: '50.00', orders: 1, units: 2 },
        { date: '2025-01-02', sales: '75.00', orders: 1, units: 3 },
      ]);
    });
  });
});

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
