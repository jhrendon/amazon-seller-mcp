import { describe, it, expect, vi, beforeEach } from 'vitest';

const postMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({ post: postMock }),
}));

import { registerPricingTools } from '../src/tools/pricing.js';

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

describe('pricing tools', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  describe('get_competitive_summary', () => {
    it('rejects when both asin and asins are provided', () => {
      const { server, tools } = makeServer();
      registerPricingTools(server);
      const schema = tools['get_competitive_summary'].schema as { parse: (v: unknown) => unknown };
      expect(() =>
        schema.parse({ asin: 'B001', asins: ['B002'] })
      ).toThrow();
    });

    it('handles a single ASIN', async () => {
      postMock.mockResolvedValue({
        responses: [{ asin: 'B001', marketplaceId: 'ATVPDKIKX0DER' }],
      });
      const { server, tools } = makeServer();
      registerPricingTools(server);
      const handler = tools['get_competitive_summary'].handler;
      const result = (await handler({ asin: 'B001' })) as {
        structuredContent: { responses: { asin: string }[] };
      };
      expect(result.structuredContent.responses).toHaveLength(1);
      expect(postMock).toHaveBeenCalledWith(
        '/products/pricing/2022-05-01/competitiveSummary',
        expect.objectContaining({ asins: ['B001'] }),
        expect.objectContaining({ rateLimitCategory: 'pricing' })
      );
    });

    it('handles a batch of 20 ASINs', async () => {
      postMock.mockResolvedValue({ responses: [] });
      const { server, tools } = makeServer();
      registerPricingTools(server);
      const schema = tools['get_competitive_summary'].schema as { parse: (v: unknown) => unknown };
      const asins = Array.from({ length: 20 }, (_, i) => `B${i.toString().padStart(9, '0')}`);
      expect(() => schema.parse({ asins })).not.toThrow();
    });

    it('rejects more than 20 ASINs', () => {
      const { server, tools } = makeServer();
      registerPricingTools(server);
      const schema = tools['get_competitive_summary'].schema as { parse: (v: unknown) => unknown };
      const asins = Array.from({ length: 21 }, (_, i) => `B${i.toString().padStart(9, '0')}`);
      expect(() => schema.parse({ asins })).toThrow();
    });
  });

  describe('get_featured_offer_expected_price_batch', () => {
    it('rejects when both sku and skus are provided', () => {
      const { server, tools } = makeServer();
      registerPricingTools(server);
      const schema = tools['get_featured_offer_expected_price_batch'].schema as {
        parse: (v: unknown) => unknown;
      };
      expect(() =>
        schema.parse({ sku: 'SKU-1', skus: ['SKU-2'], price: { currencyCode: 'USD', amount: '10.00' } })
      ).toThrow();
    });

    it('handles a single SKU and converts price to Money shape', async () => {
      postMock.mockResolvedValue({ responses: [] });
      const { server, tools } = makeServer();
      registerPricingTools(server);
      const handler = tools['get_featured_offer_expected_price_batch'].handler;
      await handler({ sku: 'SKU-1', price: { currencyCode: 'USD', amount: '24.99' } });
      expect(postMock).toHaveBeenCalledWith(
        '/products/pricing/2022-05-01/featuredOfferExpectedPriceBatch',
        expect.objectContaining({
          requests: expect.arrayContaining([
            expect.objectContaining({ sku: 'SKU-1', expectedPrice: { CurrencyCode: 'USD', Amount: '24.99' } }),
          ]),
        }),
        expect.objectContaining({ rateLimitCategory: 'pricing' })
      );
    });

    it('handles a batch of 40 SKUs', async () => {
      postMock.mockResolvedValue({ responses: [] });
      const { server, tools } = makeServer();
      registerPricingTools(server);
      const schema = tools['get_featured_offer_expected_price_batch'].schema as {
        parse: (v: unknown) => unknown;
      };
      const skus = Array.from({ length: 40 }, (_, i) => `SKU-${i}`);
      expect(() =>
        schema.parse({ skus, price: { currencyCode: 'USD', amount: '10.00' } })
      ).not.toThrow();
    });

    it('rejects more than 40 SKUs', () => {
      const { server, tools } = makeServer();
      registerPricingTools(server);
      const schema = tools['get_featured_offer_expected_price_batch'].schema as {
        parse: (v: unknown) => unknown;
      };
      const skus = Array.from({ length: 41 }, (_, i) => `SKU-${i}`);
      expect(() =>
        schema.parse({ skus, price: { currencyCode: 'USD', amount: '10.00' } })
      ).toThrow();
    });
  });
});
