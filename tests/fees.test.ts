import { describe, it, expect, vi, beforeEach } from 'vitest';

const postMock = vi.fn();
const getMock = vi.fn();
const putMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({
    get: getMock,
    post: postMock,
    put: putMock,
  }),
}));

import { getFeesEstimateForAsinBatch, registerFeesTools } from '../src/tools/fees.js';

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

describe('live fees tools', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  describe('getFeesEstimateForAsinBatch', () => {
    it('loops and returns an array of estimates for a batch of ASINs', async () => {
      postMock.mockResolvedValue({ request: {}, response: { asin: 'X', status: 'OK' } });
      const asins = Array.from({ length: 5 }, (_, i) => `B0000000${i}`);
      const result = await getFeesEstimateForAsinBatch(asins, { currencyCode: 'USD', amount: '10.00' }, 'ATVPDKIKX0DER');

      expect(postMock).toHaveBeenCalledTimes(5);
      expect(result.results).toHaveLength(5);
    });

    it('sends CurrencyCode / Amount in the Amazon money shape', async () => {
      postMock.mockResolvedValue({ request: {}, response: { asin: 'X', status: 'OK' } });
      await getFeesEstimateForAsinBatch(['B001'], { currencyCode: 'USD', amount: '24.99' }, 'ATVPDKIKX0DER');
      expect(postMock).toHaveBeenCalledWith(
        '/products/fees/v0/feesEstimate',
        expect.objectContaining({ price: { CurrencyCode: 'USD', Amount: '24.99' } }),
        expect.objectContaining({ rateLimitCategory: 'productFees' })
      );
    });
  });

  describe('get_fees_estimate_for_asin', () => {
    it('rejects more than 20 ASINs at the zod layer', () => {
      const { server, tools } = makeServer();
      registerFeesTools(server);
      const schema = tools['get_fees_estimate_for_asin'].schema as { parse: (v: unknown) => unknown };
      const asins = Array.from({ length: 21 }, (_, i) => `B0000000${i.toString().padStart(2, '0')}`);
      expect(() => schema.parse({ asins, price: { currencyCode: 'USD', amount: '10.00' } })).toThrow();
    });

    it('rejects when both asin and asins are provided', () => {
      const { server, tools } = makeServer();
      registerFeesTools(server);
      const schema = tools['get_fees_estimate_for_asin'].schema as { parse: (v: unknown) => unknown };
      expect(() =>
        schema.parse({
          asin: 'B001',
          asins: ['B002'],
          price: { currencyCode: 'USD', amount: '10.00' },
        })
      ).toThrow();
    });

    it('handles a single ASIN via the tool handler', async () => {
      postMock.mockResolvedValue({ request: {}, response: { asin: 'B001', status: 'OK' } });
      const { server, tools } = makeServer();
      registerFeesTools(server);
      const handler = tools['get_fees_estimate_for_asin'].handler;
      const result = (await handler({ asin: 'B001', price: { currencyCode: 'USD', amount: '10.00' } })) as {
        structuredContent: { results: unknown[] };
      };
      expect(result.structuredContent.results).toHaveLength(1);
    });
  });

  describe('get_fees_estimate_for_sku', () => {
    it('defaults shippingSpeed to Standard', async () => {
      postMock.mockResolvedValue({ request: {}, response: { sku: 'SKU-1', status: 'OK' } });
      const { server, tools } = makeServer();
      registerFeesTools(server);
      const handler = tools['get_fees_estimate_for_sku'].handler;
      await handler({ sku: 'SKU-1', price: { currencyCode: 'USD', amount: '10.00' } });
      expect(postMock).toHaveBeenCalledWith(
        '/products/fees/v0/feesEstimate',
        expect.objectContaining({ shippingSpeed: 'Standard' }),
        expect.any(Object)
      );
    });

    it('passes through Expedited and Priority', async () => {
      postMock.mockResolvedValue({ request: {}, response: { sku: 'SKU-1', status: 'OK' } });
      const { server, tools } = makeServer();
      registerFeesTools(server);
      const handler = tools['get_fees_estimate_for_sku'].handler;
      await handler({ sku: 'SKU-1', price: { currencyCode: 'USD', amount: '10.00' }, shippingSpeed: 'Expedited' });
      expect(postMock).toHaveBeenLastCalledWith(
        '/products/fees/v0/feesEstimate',
        expect.objectContaining({ shippingSpeed: 'Expedited' }),
        expect.any(Object)
      );
      await handler({ sku: 'SKU-1', price: { currencyCode: 'USD', amount: '10.00' }, shippingSpeed: 'Priority' });
      expect(postMock).toHaveBeenLastCalledWith(
        '/products/fees/v0/feesEstimate',
        expect.objectContaining({ shippingSpeed: 'Priority' }),
        expect.any(Object)
      );
    });
  });
});
