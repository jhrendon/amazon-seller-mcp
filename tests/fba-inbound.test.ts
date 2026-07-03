import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({
    get: getMock,
    post: postMock,
  }),
}));

import { registerFBAInboundTools } from '../src/tools/fba-inbound.js';
import { setParticipatingMarketplaceIds } from '../src/tools/_shared/marketplace.js';

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

describe('fba inbound tools', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    setParticipatingMarketplaceIds(['ATVPDKIKX0DER']);
  });

  describe('list_inbound_plans', () => {
    it('returns inbound plans with pagination', async () => {
      const apiResponse = {
        inboundPlans: [
          { inboundPlanId: 'plan-1', name: 'Plan One', status: 'ACTIVE', createdAt: '2025-01-01T00:00:00Z' },
          { inboundPlanId: 'plan-2', name: 'Plan Two', status: 'VOIDED', createdAt: '2025-01-02T00:00:00Z' },
        ],
        nextToken: 'tok-123',
      };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerFBAInboundTools(server);
      const handler = tools['list_inbound_plans'].handler;

      const result = (await handler({ status: 'ACTIVE', pageSize: 10 })) as {
        structuredContent: typeof apiResponse;
      };

      expect(getMock).toHaveBeenCalledWith(
        '/inbound/fba/2024-03-20/inboundPlans',
        expect.objectContaining({ marketplaceId: 'ATVPDKIKX0DER', status: 'ACTIVE', pageSize: 10 }),
        expect.objectContaining({ rateLimitCategory: 'fbaInbound' })
      );
      expect(result.structuredContent.inboundPlans).toHaveLength(2);
      expect(result.structuredContent.nextToken).toBe('tok-123');
    });

    it('accepts nextToken as alias for paginationToken', async () => {
      getMock.mockResolvedValue({ inboundPlans: [] });

      const { server, tools } = makeServer();
      registerFBAInboundTools(server);
      const handler = tools['list_inbound_plans'].handler;

      await handler({ nextToken: 'alias-tok' });

      expect(getMock).toHaveBeenCalledWith(
        '/inbound/fba/2024-03-20/inboundPlans',
        expect.objectContaining({ paginationToken: 'alias-tok' }),
        expect.any(Object)
      );
    });
  });

  describe('get_inbound_plan', () => {
    it('returns plan details', async () => {
      const apiResponse = {
        inboundPlanId: 'plan-1',
        name: 'Plan One',
        status: 'ACTIVE',
        marketplaceId: 'ATVPDKIKX0DER',
        shipmentIds: ['shipment-1'],
        placementOptionIds: ['placement-1'],
      };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerFBAInboundTools(server);
      const handler = tools['get_inbound_plan'].handler;

      const result = (await handler({ inboundPlanId: 'plan-1' })) as {
        structuredContent: typeof apiResponse;
      };

      expect(getMock).toHaveBeenCalledWith(
        '/inbound/fba/2024-03-20/inboundPlans/plan-1',
        expect.objectContaining({ marketplaceId: 'ATVPDKIKX0DER' }),
        expect.objectContaining({ rateLimitCategory: 'fbaInbound' })
      );
      expect(result.structuredContent.inboundPlanId).toBe('plan-1');
    });
  });

  describe('create_inbound_plan', () => {
    it('creates a plan with transformed request body', async () => {
      const apiResponse = { inboundPlanId: 'plan-new', operationId: 'op-1' };
      postMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerFBAInboundTools(server);
      const handler = tools['create_inbound_plan'].handler;

      const result = (await handler({
        marketplaceId: 'ATVPDKIKX0DER',
        originAddress: {
          name: 'Warehouse',
          addressLine1: '123 Main St',
          city: 'Austin',
          stateOrRegion: 'TX',
          postalCode: '78701',
          countryCode: 'US',
        },
        items: [{ asin: 'B001', quantity: 10 }],
      })) as { structuredContent: typeof apiResponse };

      expect(postMock).toHaveBeenCalledWith(
        '/inbound/fba/2024-03-20/inboundPlans',
        expect.objectContaining({
          marketplaceId: 'ATVPDKIKX0DER',
          originAddress: expect.objectContaining({ addressLine1: '123 Main St' }),
          items: expect.arrayContaining([expect.objectContaining({ asin: 'B001', quantity: 10 })]),
        }),
        expect.objectContaining({ rateLimitCategory: 'fbaInbound' })
      );
      expect(result.structuredContent.inboundPlanId).toBe('plan-new');
    });

    it('rejects empty items array via zod', () => {
      const { server, tools } = makeServer();
      registerFBAInboundTools(server);
      const schema = tools['create_inbound_plan'].schema as { parse: (v: unknown) => unknown };
      expect(() =>
        schema.parse({
          marketplaceId: 'ATVPDKIKX0DER',
          originAddress: { addressLine1: '123 Main St' },
          items: [],
        })
      ).toThrow();
    });
  });

  describe('list_inbound_plan_shipments', () => {
    it('returns shipments for a plan', async () => {
      const apiResponse = {
        shipments: [{ shipmentId: 'shipment-1', name: 'Shipment One', status: 'WORKING' }],
        nextToken: 'tok-456',
      };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerFBAInboundTools(server);
      const handler = tools['list_inbound_plan_shipments'].handler;

      const result = (await handler({ inboundPlanId: 'plan-1', pageSize: 5 })) as {
        structuredContent: typeof apiResponse;
      };

      expect(getMock).toHaveBeenCalledWith(
        '/inbound/fba/2024-03-20/inboundPlans/plan-1/shipments',
        expect.objectContaining({ marketplaceId: 'ATVPDKIKX0DER', pageSize: 5 }),
        expect.objectContaining({ rateLimitCategory: 'fbaInbound' })
      );
      expect(result.structuredContent.shipments).toHaveLength(1);
    });
  });

  describe('get_inbound_shipment', () => {
    it('returns shipment details', async () => {
      const apiResponse = {
        shipmentId: 'shipment-1',
        status: 'WORKING',
        boxes: [],
        items: [{ asin: 'B001', quantity: 10 }],
      };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerFBAInboundTools(server);
      const handler = tools['get_inbound_shipment'].handler;

      const result = (await handler({ inboundPlanId: 'plan-1', shipmentId: 'shipment-1' })) as {
        structuredContent: typeof apiResponse;
      };

      expect(getMock).toHaveBeenCalledWith(
        '/inbound/fba/2024-03-20/inboundPlans/plan-1/shipments/shipment-1',
        expect.objectContaining({ marketplaceId: 'ATVPDKIKX0DER' }),
        expect.objectContaining({ rateLimitCategory: 'fbaInbound' })
      );
      expect(result.structuredContent.shipmentId).toBe('shipment-1');
    });
  });
});
