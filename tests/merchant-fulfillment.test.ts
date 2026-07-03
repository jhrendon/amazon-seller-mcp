import { describe, it, expect, vi, beforeEach } from 'vitest';

const postMock = vi.fn();
const getMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({
    post: postMock,
    get: getMock,
    delete: deleteMock,
  }),
}));

import { registerMerchantFulfillmentTools } from '../src/tools/merchant-fulfillment.js';
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

const shipmentRequestDetailsFixture = {
  amazonOrderId: '111-1234567-1234567',
  itemList: [{ orderItemId: 'oi-1', quantity: 1 }],
  shipFromAddress: {
    name: 'Warehouse',
    addressLine1: '123 Main St',
    city: 'Austin',
    stateOrRegion: 'TX',
    postalCode: '78701',
    countryCode: 'US',
  },
  packageDimensions: { length: 10, width: 8, height: 6, unit: 'inches' },
  weight: { value: 2, unit: 'pounds' },
  shippingServiceOptions: {
    deliveryExperience: 'DeliveryConfirmationWithoutSignature',
    declaredValue: { currencyCode: 'USD', amount: 24.99 },
  },
};

describe('merchant fulfillment tools', () => {
  beforeEach(() => {
    postMock.mockReset();
    getMock.mockReset();
    deleteMock.mockReset();
    setParticipatingMarketplaceIds(['ATVPDKIKX0DER']);
  });

  describe('get_eligible_shipping_services', () => {
    it('returns eligible services', async () => {
      const apiResponse = {
        shippingServiceList: [
          { shippingServiceId: 'svc-1', shippingServiceName: 'Standard', rate: { currencyCode: 'USD', amount: 5.99 } },
        ],
        marketplaceId: 'ATVPDKIKX0DER',
      };
      postMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerMerchantFulfillmentTools(server);
      const handler = tools['get_eligible_shipping_services'].handler;

      const result = (await handler({ shipmentRequestDetails: shipmentRequestDetailsFixture })) as {
        structuredContent: typeof apiResponse;
      };

      expect(postMock).toHaveBeenCalledWith(
        '/mfn/v0/eligibleShippingServices',
        expect.objectContaining({
          shipmentRequestDetails: expect.objectContaining({
            amazonOrderId: '111-1234567-1234567',
            packageDimensions: { length: 10, width: 8, height: 6, unit: 'inches' },
          }),
        }),
        expect.objectContaining({ rateLimitCategory: 'merchantFulfillment' })
      );
      expect(result.structuredContent.shippingServiceList).toHaveLength(1);
    });
  });

  describe('create_shipment', () => {
    it('creates a shipment and returns label info', async () => {
      const apiResponse = {
        shipmentId: 'shp-1',
        trackingId: 'track-1',
        label: { fileContents: 'base64', labelFormat: 'PDF' },
        marketplaceId: 'ATVPDKIKX0DER',
      };
      postMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerMerchantFulfillmentTools(server);
      const handler = tools['create_shipment'].handler;

      const result = (await handler({
        shipmentRequestDetails: shipmentRequestDetailsFixture,
        shippingServiceId: 'svc-1',
      })) as { structuredContent: typeof apiResponse };

      expect(postMock).toHaveBeenCalledWith(
        '/mfn/v0/shipments',
        expect.objectContaining({
          shipmentRequestDetails: expect.any(Object),
          shippingServiceId: 'svc-1',
        }),
        expect.objectContaining({ rateLimitCategory: 'merchantFulfillment' })
      );
      expect(result.structuredContent.shipmentId).toBe('shp-1');
    });
  });

  describe('get_shipment', () => {
    it('returns shipment details', async () => {
      const apiResponse = { shipmentId: 'shp-1', status: 'Purchased', trackingId: 'track-1' };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerMerchantFulfillmentTools(server);
      const handler = tools['get_shipment'].handler;

      const result = (await handler({ shipmentId: 'shp-1' })) as { structuredContent: typeof apiResponse };

      expect(getMock).toHaveBeenCalledWith(
        '/mfn/v0/shipments/shp-1',
        undefined,
        expect.objectContaining({ rateLimitCategory: 'merchantFulfillment' })
      );
      expect(result.structuredContent.trackingId).toBe('track-1');
    });
  });

  describe('cancel_shipment', () => {
    it('cancels a shipment', async () => {
      const apiResponse = { shipmentId: 'shp-1', status: 'Cancelled' };
      deleteMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerMerchantFulfillmentTools(server);
      const handler = tools['cancel_shipment'].handler;

      const result = (await handler({ shipmentId: 'shp-1' })) as { structuredContent: typeof apiResponse };

      expect(deleteMock).toHaveBeenCalledWith(
        '/mfn/v0/shipments/shp-1',
        expect.objectContaining({ rateLimitCategory: 'merchantFulfillment' })
      );
      expect(result.structuredContent.status).toBe('Cancelled');
    });
  });
});
