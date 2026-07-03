import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
const putMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/sp-api-client.js')>();
  return {
    ...actual,
    getSPAPIClient: () => ({
      get: getMock,
      put: putMock,
      patch: patchMock,
      delete: deleteMock,
    }),
  };
});

import { SPAPIError } from '../src/client/sp-api-client.js';
import { buildPatchBody, registerListingsTools } from '../src/tools/listings.js';

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

describe('listings tools', () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
  });

  describe('get_listing', () => {
    it('returns the parsed item document', async () => {
      const apiResponse = { sku: 'SKU-1', productType: 'LUGGAGE', attributes: { color: 'red' } };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerListingsTools(server);
      const handler = tools['get_listing'].handler;
      const result = (await handler({ sku: 'SKU-1' })) as { structuredContent: { sku: string } };

      expect(getMock).toHaveBeenCalledWith(
        expect.stringContaining('/listings/2021-08-01/items/'),
        expect.objectContaining({ marketplaceIds: expect.any(String) }),
        expect.objectContaining({ rateLimitCategory: 'listings' })
      );
      expect(result.structuredContent.sku).toBe('SKU-1');
    });
  });

  describe('put_listing', () => {
    it('strips undefined fields from the body and submits', async () => {
      putMock.mockResolvedValue({ submissionId: 'sub-1', sku: 'SKU-2' });
      const { server, tools } = makeServer();
      registerListingsTools(server);
      const handler = tools['put_listing'].handler;
      await handler({
        sku: 'SKU-2',
        productType: 'LUGGAGE',
        attributes: { color: 'blue' },
        condition: undefined,
        merchantSuggestedAsin: undefined,
      });
      const body = putMock.mock.calls[0][1];
      expect(body).not.toHaveProperty('condition');
      expect(body).not.toHaveProperty('merchantSuggestedAsin');
      expect(body.sku).toBe('SKU-2');
      expect(body.productType).toBe('LUGGAGE');
      expect(putMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ params: expect.objectContaining({ marketplaceIds: expect.any(String) }) })
      );
    });
  });

  describe('patch_listing', () => {
    it('returns "nothing to update" for an empty patch', async () => {
      const { server, tools } = makeServer();
      registerListingsTools(server);
      const handler = tools['patch_listing'].handler;
      const result = (await handler({ sku: 'SKU-3' })) as { structuredContent: { message: string; sent?: undefined } };
      expect(result.structuredContent.message).toMatch(/nothing to update/i);
      expect(patchMock).not.toHaveBeenCalled();
    });

    it('sends only the provided fields and uses PATCH', async () => {
      patchMock.mockResolvedValue({ submissionId: 'sub-2', sku: 'SKU-4' });
      const { server, tools } = makeServer();
      registerListingsTools(server);
      const handler = tools['patch_listing'].handler;
      const result = (await handler({
        sku: 'SKU-4',
        attributes: { color: 'green' },
      })) as { structuredContent: { sku: string } };

      expect(patchMock).toHaveBeenCalledTimes(1);
      const body = patchMock.mock.calls[0][1];
      expect(body).toEqual({ attributes: { color: 'green' } });
      expect(result.structuredContent.sku).toBe('SKU-4');
    });
  });

  describe('delete_listing', () => {
    it('returns 200 confirmation on success', async () => {
      deleteMock.mockResolvedValue({ sku: 'SKU-5', status: 'DELETED' });
      const { server, tools } = makeServer();
      registerListingsTools(server);
      const handler = tools['delete_listing'].handler;
      const result = (await handler({ sku: 'SKU-5' })) as { structuredContent: { status: string } };
      expect(result.structuredContent.status).toBe('DELETED');
    });

    it('surfaces 404 verbatim when the listing does not exist', async () => {
      deleteMock.mockRejectedValue(new SPAPIError('Listing not found', 404, 'NOT_FOUND', false, 'sku not found'));
      const { server, tools } = makeServer();
      registerListingsTools(server);
      const handler = tools['delete_listing'].handler;
      await expect(handler({ sku: 'SKU-6' })).rejects.toThrow(/Listing not found/);
    });
  });

  describe('buildPatchBody', () => {
    it('strips undefined fields from the patch body', () => {
      const result = buildPatchBody({
        sku: 'SKU-7',
        productType: undefined,
        attributes: { a: 1 },
        fulfillmentAvailability: undefined,
        purchasableOffer: undefined,
        merchantSuggestedAsin: undefined,
        condition: undefined,
      });
      expect(result).toEqual({ attributes: { a: 1 } });
    });

    it('keeps all provided fields', () => {
      const result = buildPatchBody({
        sku: 'SKU-8',
        productType: 'LUGGAGE',
        attributes: { color: 'red' },
        condition: 'new_new',
        purchasableOffer: [{ audience: 'ALL' }],
        fulfillmentAvailability: [{ fulfillmentChannelCode: 'AMAZON', quantity: 5 }],
        merchantSuggestedAsin: [{ asin: 'B001' }],
      });
      expect(result.productType).toBe('LUGGAGE');
      expect(result.attributes).toEqual({ color: 'red' });
      expect(result.condition).toBe('new_new');
    });
  });
});
