import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { moneySchema, toMoney, marketplaceIdSchema } from './_shared/schemas.js';
import { makeToolResponse } from './_shared/response.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import type { FeesEstimateRequest, FeesEstimateResponse, ShippingSpeed } from '../types/sp-api.js';

const getFeesEstimateForAsinSchema = z
  .object({
    asin: z.string().optional().describe('Single ASIN (mutually exclusive with `asins`)'),
    asins: z.array(z.string()).max(20).optional().describe('Up to 20 ASINs (mutually exclusive with `asin`)'),
    price: moneySchema.describe('The price to use for the fee calculation'),
    marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
  })
  .refine((v) => Boolean(v.asin) !== Boolean(v.asins), {
    message: 'Provide exactly one of `asin` or `asins`',
  });

const getFeesEstimateForSkuSchema = z.object({
  sku: z.string().min(1).describe('Seller SKU'),
  price: moneySchema,
  shippingSpeed: z
    .enum(['Standard', 'Expedited', 'Priority'])
    .optional()
    .default('Standard')
    .describe('Shipping speed (default Standard)'),
  marketplaceId: marketplaceIdSchema.optional(),
});

export interface FeesEstimateBatchResult {
  results: FeesEstimateResponse[];
}

export async function getFeesEstimateForAsinBatch(
  asins: string[],
  price: { currencyCode: string; amount: string },
  marketplaceId: string
): Promise<FeesEstimateBatchResult> {
  const client = getSPAPIClient();
  const results: FeesEstimateResponse[] = [];
  for (const asin of asins) {
    const request: FeesEstimateRequest = { asin, marketplaceId, price: toMoney(price) };
    const response = await client.post<FeesEstimateResponse>(
      '/products/fees/v0/feesEstimate',
      request,
      { rateLimitCategory: 'productFees' }
    );
    results.push(response);
  }
  return { results };
}

export function registerFeesTools(server: McpServer): void {
  server.registerTool(
    'get_fees_estimate_for_asin',
    {
      description:
        'Compute FBA fee estimates in real time for one ASIN or up to 20 ASINs at a given price. Use this for live repricing; the report-based `get_fba_fee_estimates` is better for batch historical analysis.',
      inputSchema: getFeesEstimateForAsinSchema,
    },
    async (input) => {
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);
      const asins = input.asin ? [input.asin] : (input.asins ?? []);
      const result = await getFeesEstimateForAsinBatch(asins, input.price, marketplaceId);
      return makeToolResponse(result);
    }
  );

  server.registerTool(
    'get_fees_estimate_for_sku',
    {
      description:
        'Compute FBA fee estimate in real time for a single SKU at a given price and shipping speed. Use this when you know the SKU and the shipping speed; for ASIN-based estimation use `get_fees_estimate_for_asin`.',
      inputSchema: getFeesEstimateForSkuSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);
      const shippingSpeed: ShippingSpeed = input.shippingSpeed ?? 'Standard';
      const request: FeesEstimateRequest = {
        sku: input.sku,
        marketplaceId,
        price: toMoney(input.price),
        shippingSpeed,
      };
      const response = await client.post<FeesEstimateResponse>(
        '/products/fees/v0/feesEstimate',
        request,
        { rateLimitCategory: 'productFees' }
      );
      return makeToolResponse(response);
    }
  );
}
