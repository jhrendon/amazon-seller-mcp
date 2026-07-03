import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { getConfig } from '../config/index.js';
import { moneySchema, toMoney, marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import { makeToolResponse } from './_shared/response.js';
import type {
  CompetitiveSummaryBatchResponse,
  CompetitiveSummaryResponse,
  FeaturedOfferExpectedPriceBatchResponse,
} from '../types/sp-api.js';

const getCompetitiveSummarySchema = z
  .object({
    asin: z.string().optional().describe('Single ASIN (mutually exclusive with `asins`)'),
    asins: z.array(z.string()).max(20).optional().describe('Up to 20 ASINs (mutually exclusive with `asin`)'),
    marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
  })
  .refine((v) => Boolean(v.asin) !== Boolean(v.asins), {
    message: 'Provide exactly one of `asin` or `asins`',
  });

const getFeaturedOfferExpectedPriceBatchSchema = z
  .object({
    sku: z.string().optional().describe('Single SKU (mutually exclusive with `skus`)'),
    skus: z.array(z.string()).max(40).optional().describe('Up to 40 SKUs (mutually exclusive with `sku`)'),
    price: moneySchema.describe('The current price used to compute the FOEP'),
    marketplaceId: marketplaceIdSchema.optional(),
  })
  .refine((v) => Boolean(v.sku) !== Boolean(v.skus), {
    message: 'Provide exactly one of `sku` or `skus`',
  });

export interface CompetitiveSummaryBatchResult {
  responses: CompetitiveSummaryResponse[];
}

export interface FeaturedOfferExpectedPriceBatchResult {
  responses: FeaturedOfferExpectedPriceBatchResponse['responses'];
}

export function registerPricingTools(server: McpServer): void {
  server.registerTool(
    'get_competitive_summary',
    {
      description:
        'Retrieve competitor pricing summary (featured offer price, lowest price, buy box price, number of offers) for one ASIN or up to 20 ASINs. Use this for competitive analysis and repricing decisions.',
      inputSchema: getCompetitiveSummarySchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);
      const asins = input.asin ? [input.asin] : (input.asins ?? []);

      const response = await client.post<CompetitiveSummaryBatchResponse>(
        '/products/pricing/2022-05-01/competitiveSummary',
        {
          asins,
          marketplaceId,
          includedData: ['featuredBuyingOptions', 'referencePrices', 'competitivePrices'],
        },
        { rateLimitCategory: 'pricing' }
      );

      const payload: CompetitiveSummaryBatchResult = {
        responses: response.responses ?? [],
      };

      return makeToolResponse(payload);
    }
  );

  server.registerTool(
    'get_featured_offer_expected_price_batch',
    {
      description:
        'Retrieve the Featured Offer Expected Price (FOEP) for one SKU or up to 40 SKUs at a given price. The FOEP is the price Amazon expects would win the Buy Box under current conditions — useful for automated repricers.',
      inputSchema: getFeaturedOfferExpectedPriceBatchSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const config = getConfig();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);
      const skus = input.sku ? [input.sku] : (input.skus ?? []);

      const requests = skus.map((sku) => ({
        sellerId: config.SELLER_ID,
        marketplaceId,
        sku,
        expectedPrice: toMoney(input.price),
      }));

      const response = await client.post<FeaturedOfferExpectedPriceBatchResponse>(
        '/products/pricing/2022-05-01/featuredOfferExpectedPriceBatch',
        { requests },
        { rateLimitCategory: 'pricing' }
      );

      const payload: FeaturedOfferExpectedPriceBatchResult = {
        responses: response.responses ?? [],
      };

      return makeToolResponse(payload);
    }
  );
}
