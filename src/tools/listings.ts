import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { getConfig } from '../config/index.js';
import { marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import { makeToolResponse } from './_shared/response.js';
import type {
  ListingsItem,
  ListingsItemPatch,
  ItemSearchResponse,
  ItemSearchResult,
  FulfillmentAvailability,
  PurchasableOffer,
  ItemAttributes,
} from '../types/sp-api.js';

const includedDataValues = [
  'summaries',
  'attributes',
  'issues',
  'fulfillmentAvailability',
  'purchasableOffer',
  'productTypes',
  'relationships',
  'identifiers',
  'images',
  'salesRanks',
] as const;

const fulfillmentChannelValues = ['AMAZON', 'MERCHANT', 'DEFAULT'] as const;

const fulfillmentAvailabilitySchema = z.object({
  fulfillmentChannelCode: z.enum(fulfillmentChannelValues),
  quantity: z.number().int().nonnegative().optional(),
  leadTimeToShipMaxDays: z.number().int().nonnegative().optional(),
  restockDate: z.string().optional(),
});

const purchasableOfferSchema = z.object({
  audience: z.enum(['ALL', 'B2B']).optional(),
  quantity: z.number().int().nonnegative().optional(),
  maxPrice: z
    .object({
      CurrencyCode: z.string().length(3),
      Amount: z.string().min(1),
    })
    .optional(),
  minimumSellerAllowedPrice: z
    .object({
      CurrencyCode: z.string().length(3),
      Amount: z.string().min(1),
    })
    .optional(),
  maximumSellerAllowedPrice: z
    .object({
      CurrencyCode: z.string().length(3),
      Amount: z.string().min(1),
    })
    .optional(),
});

const listingPayloadShape = {
  productType: z.string().min(1).describe('Amazon product type (e.g., "LUGGAGE", "TOY")'),
  attributes: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Product-type-specific attributes as a key/value map'),
  fulfillmentAvailability: z
    .array(fulfillmentAvailabilitySchema)
    .optional()
    .describe('Fulfillment availability per channel'),
  purchasableOffer: z.array(purchasableOfferSchema).optional().describe('Purchasable offer details'),
  merchantSuggestedAsin: z
    .array(
      z.object({
        asin: z.string().min(1),
        category: z.string().optional(),
      })
    )
    .optional(),
  condition: z.string().optional().describe('Item condition (e.g., "new_new")'),
};

const getListingSchema = z.object({
  sku: z.string().min(1).describe('The seller SKU'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
  includedData: z
    .array(z.enum(includedDataValues))
    .optional()
    .describe('Datasets to include in the response (defaults to all major datasets)'),
});

const searchListingsSchema = z.object({
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
  status: z.string().optional().describe('Filter by listing status (e.g., "BUYABLE", "INCOMPLETE")'),
  sku: z.string().optional(),
  productType: z.string().optional(),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  pageToken: z.string().optional(),
});

const putListingSchema = z.object({
  sku: z.string().min(1),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
  ...listingPayloadShape,
});

const patchListingSchema = z.object({
  sku: z.string().min(1),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
  productType: z.string().min(1).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  fulfillmentAvailability: z.array(fulfillmentAvailabilitySchema).optional(),
  purchasableOffer: z.array(purchasableOfferSchema).optional(),
  merchantSuggestedAsin: z
    .array(
      z.object({
        asin: z.string().min(1),
        category: z.string().optional(),
      })
    )
    .optional(),
  condition: z.string().optional(),
});

const deleteListingSchema = z.object({
  sku: z.string().min(1),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

function stripUndefined<T>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export function buildPatchBody(input: z.infer<typeof patchListingSchema>): Partial<ListingsItemPatch> {
  const body: ListingsItemPatch = {};
  if (input.productType !== undefined) body.productType = input.productType;
  if (input.attributes !== undefined) body.attributes = input.attributes as ItemAttributes;
  if (input.fulfillmentAvailability !== undefined)
    body.fulfillmentAvailability = input.fulfillmentAvailability as FulfillmentAvailability[];
  if (input.purchasableOffer !== undefined) body.purchasableOffer = input.purchasableOffer as PurchasableOffer[];
  if (input.merchantSuggestedAsin !== undefined) body.merchantSuggestedAsin = input.merchantSuggestedAsin;
  if (input.condition !== undefined) body.condition = input.condition;
  return stripUndefined(body);
}

export function registerListingsTools(server: McpServer): void {
  server.registerTool(
    'get_listing',
    {
      description:
        'Retrieve the full Listings Item document for a given seller SKU in a marketplace, including summaries, attributes, fulfillment availability, purchasable offer, and any listing issues. Use this before editing a listing to know its current state.',
      inputSchema: getListingSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const config = getConfig();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);
      const includedData = input.includedData ?? [
        'summaries',
        'attributes',
        'issues',
        'fulfillmentAvailability',
        'purchasableOffer',
      ];

      const response = await client.get<ListingsItem>(
        `/listings/2021-08-01/items/${encodeURIComponent(config.SELLER_ID)}/${encodeURIComponent(input.sku)}`,
        {
          marketplaceIds: marketplaceId,
          includedData: includedData.join(','),
        },
        { rateLimitCategory: 'listings' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'search_listings',
    {
      description:
        'Search the seller\'s listings by optional filters (status, sku, productType). Supports pagination via `pageToken` with a cap of 20 pages.',
      inputSchema: searchListingsSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const config = getConfig();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const queryParams: Record<string, unknown> = {
        marketplaceIds: marketplaceId,
        pageSize: input.pageSize,
      };
      if (input.status) queryParams.status = input.status;
      if (input.sku) queryParams.sku = input.sku;
      if (input.productType) queryParams.productType = input.productType;
      if (input.pageToken) queryParams.pageToken = input.pageToken;

      const response = await client.get<{ items: ItemSearchResult[]; nextToken?: string }>(
        `/listings/2021-08-01/items/${encodeURIComponent(config.SELLER_ID)}`,
        queryParams,
        { rateLimitCategory: 'listings' }
      );

      const payload: ItemSearchResponse = {
        items: response.items ?? [],
        nextToken: response.nextToken,
      };

      return makeToolResponse(payload);
    }
  );

  server.registerTool(
    'put_listing',
    {
      description:
        'Create or fully replace a listing for a given SKU. Returns the submitted document and a submissionId. NOTE: this is destructive — a full replacement overwrites every field. Prefer `patch_listing` for incremental updates. Recommend `search_listings` → `get_listing` first to know the current state.',
      inputSchema: putListingSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const config = getConfig();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const body: ListingsItem = stripUndefined({
        sku: input.sku,
        productType: input.productType,
        attributes: input.attributes as ItemAttributes | undefined,
        fulfillmentAvailability: input.fulfillmentAvailability as FulfillmentAvailability[] | undefined,
        purchasableOffer: input.purchasableOffer as PurchasableOffer[] | undefined,
        merchantSuggestedAsin: input.merchantSuggestedAsin,
        condition: input.condition,
      }) as ListingsItem;

      const result = await client.put<{ submissionId: string; sku: string; productType: string } & ListingsItem>(
        `/listings/2021-08-01/items/${encodeURIComponent(config.SELLER_ID)}/${encodeURIComponent(input.sku)}`,
        body,
        { rateLimitCategory: 'listings', params: { marketplaceIds: marketplaceId } }
      );

      return makeToolResponse(result);
    }
  );

  server.registerTool(
    'patch_listing',
    {
      description:
        'Apply a partial update to an existing listing (JSON Merge Patch). Only the fields you provide are changed; the rest of the listing is unchanged. If you provide an empty patch (no fields), the tool returns "nothing to update" without calling Amazon.',
      inputSchema: patchListingSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const config = getConfig();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);
      const body = buildPatchBody(input);

      if (Object.keys(body).length === 0) {
        const empty = { sku: input.sku, message: 'Nothing to update: empty patch.' };
        return makeToolResponse(empty);
      }

      const result = await client.patch<{ submissionId: string; sku: string }>(
        `/listings/2021-08-01/items/${encodeURIComponent(config.SELLER_ID)}/${encodeURIComponent(input.sku)}`,
        body,
        { rateLimitCategory: 'listings', params: { marketplaceIds: marketplaceId } }
      );

      return makeToolResponse(result);
    }
  );

  server.registerTool(
    'delete_listing',
    {
      description:
        'Delete a listing for a given SKU. This is permanent and irreversible. Use with care.',
      inputSchema: deleteListingSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const config = getConfig();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const result = await client.delete<{ sku: string; status: string }>(
        `/listings/2021-08-01/items/${encodeURIComponent(config.SELLER_ID)}/${encodeURIComponent(input.sku)}`,
        { rateLimitCategory: 'listings', params: { marketplaceIds: marketplaceId } }
      );

      return makeToolResponse(result);
    }
  );
}
