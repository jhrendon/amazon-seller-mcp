import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { registerFinanceTools } from '../src/tools/finances.js';
import { setParticipatingMarketplaceIds } from '../src/tools/_shared/marketplace.js';

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

describe('finance tools', () => {
  beforeEach(() => {
    getMock.mockReset();
    setParticipatingMarketplaceIds(['ATVPDKIKX0DER']);
  });

  describe('get_financial_events', () => {
    it('summarizes event types and counts', async () => {
      getMock.mockResolvedValueOnce({
        payload: {
          FinancialEvents: {
            ShipmentEventList: [{}, {}],
            RefundEventList: [{}],
            EmptyList: [],
          },
          NextToken: 'tok-1',
        },
      });

      const { server, tools } = makeServer();
      registerFinanceTools(server);
      const result = (await tools['get_financial_events'].handler({
        postedAfter: '2025-01-01T00:00:00Z',
      })) as {
        structuredContent: {
          totalEventCount: number;
          eventTypes: string[];
          hasMore: boolean;
          nextToken: string;
        };
      };

      expect(result.structuredContent.totalEventCount).toBe(3);
      expect(result.structuredContent.eventTypes).toContain('ShipmentEventList');
      expect(result.structuredContent.eventTypes).toContain('RefundEventList');
      expect(result.structuredContent.eventTypes).not.toContain('EmptyList');
      expect(result.structuredContent.hasMore).toBe(true);
      expect(result.structuredContent.nextToken).toBe('tok-1');
    });
  });

  describe('get_financial_event_groups', () => {
    it('maps group fields', async () => {
      getMock.mockResolvedValueOnce({
        payload: {
          FinancialEventGroupList: [
            {
              FinancialEventGroupId: 'g1',
              ProcessingStatus: 'Closed',
              FundTransferStatus: 'Transferred',
              OriginalTotal: { CurrencyCode: 'USD', Amount: '100.00' },
              ConvertedTotal: { CurrencyCode: 'USD', Amount: '100.00' },
              FundTransferDate: '2025-01-01T00:00:00Z',
              TraceId: 'trace-1',
              AccountTail: '1234',
              BeginningBalance: { CurrencyCode: 'USD', Amount: '0.00' },
              FinancialEventGroupStart: '2025-01-01T00:00:00Z',
              FinancialEventGroupEnd: '2025-01-02T00:00:00Z',
            },
          ],
        },
      });

      const { server, tools } = makeServer();
      registerFinanceTools(server);
      const result = (await tools['get_financial_event_groups'].handler({
        financialEventGroupStartedAfter: '2025-01-01T00:00:00Z',
      })) as {
        structuredContent: {
          totalGroups: number;
          eventGroups: Array<{
            financialEventGroupId: string;
            processingStatus: string;
            originalTotal: { CurrencyCode: string; Amount: string };
          }>;
        };
      };

      expect(result.structuredContent.totalGroups).toBe(1);
      expect(result.structuredContent.eventGroups[0]).toMatchObject({
        financialEventGroupId: 'g1',
        processingStatus: 'Closed',
        originalTotal: { CurrencyCode: 'USD', Amount: '100.00' },
      });
    });
  });

  describe('get_order_financial_events', () => {
    it('rejects an invalid order ID via the input schema', () => {
      const { server, tools } = makeServer();
      registerFinanceTools(server);

      const parseResult = (tools['get_order_financial_events'].schema as z.ZodTypeAny).safeParse({
        orderId: 'not-a-valid-order-id',
        marketplaceId: 'ATVPDKIKX0DER',
      });

      expect(parseResult.success).toBe(false);
    });
  });
});
