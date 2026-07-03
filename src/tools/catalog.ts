import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import type { GetCatalogItemResponse, SearchCatalogItemsResponse } from '../types/sp-api.js';

// Input schemas
const getCatalogItemSchema = z.object({
  asin: z.string().describe('The ASIN of the product to retrieve'),
  includedData: z
    .string()
    .optional()
    .default('summaries,attributes,salesRanks,images')
    .describe('Comma-separated data to include: summaries, attributes, salesRanks, images, dimensions, identifiers, relationships, productTypes'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const searchCatalogSchema = z.object({
  keywords: z.string().optional().describe('Keywords to search for in the catalog'),
  identifiers: z.string().optional().describe('Comma-separated identifiers to search (ASINs, SKUs, UPCs, EANs)'),
  identifiersType: z
    .enum(['ASIN', 'SKU', 'UPC', 'EAN'])
    .optional()
    .describe('The type of identifiers provided'),
  includedData: z
    .string()
    .optional()
    .default('summaries')
    .describe('Comma-separated data to include: summaries, attributes, salesRanks, images, dimensions, identifiers, relationships, productTypes'),
  pageSize: z.number().optional().default(10).describe('Number of results per page (max 20)'),
  pageToken: z.string().optional().describe('Pagination token for next page'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

export function registerCatalogTools(server: McpServer): void {
  server.registerTool(
    'get_catalog_item',
    {
      description:
        'Get detailed product information from the Amazon catalog by ASIN. Returns product title, brand, category, BSR (Best Sellers Rank), images, bullet points, and attributes.',
      inputSchema: getCatalogItemSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const queryParams: Record<string, unknown> = {
        marketplaceIds: marketplaceId,
        includedData: input.includedData,
      };

      const response = await client.get<GetCatalogItemResponse>(
        `/catalog/2022-04-01/items/${input.asin}`,
        queryParams,
        { rateLimitCategory: 'catalog' }
      );

      const item = response;

      const summary = item.summaries?.find(
        (s) => s.marketplaceId === marketplaceId
      ) || item.summaries?.[0];

      const salesRanks = item.salesRanks?.flatMap((rankGroup) =>
        rankGroup.displayGroupRanks?.map((rank) => ({
          title: rank.title,
          rank: rank.rank,
          link: rank.link,
        })) || []
      ) || [];

      const images = item.images?.flatMap((imageGroup) =>
        imageGroup.images?.map((img) => ({
          variant: img.variant,
          link: img.link,
          width: img.width,
          height: img.height,
        })) || []
      ) || [];

      const result = {
        asin: item.asin,
        title: summary?.itemName,
        brand: summary?.brand,
        manufacturer: summary?.manufacturer,
        classification: summary?.classificationType
          ? {
              type: summary.classificationType,
              displayName: summary.classificationDisplayName,
            }
          : undefined,
        color: summary?.color,
        size: summary?.size,
        modelNumber: summary?.modelNumber,
        packageQuantity: summary?.packageQuantity,
        bulletPoints: summary?.bulletPoints,
        salesRanks,
        imageCount: images.length,
        images: images.slice(0, 10), // Limit to first 10 images
        attributes: item.attributes,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'search_catalog',
    {
      description:
        'Search the Amazon catalog by keywords or identifiers (ASIN, SKU, UPC, EAN). Returns a list of matching items with summaries. Useful for finding products or looking up items by identifier.',
      inputSchema: searchCatalogSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      if (!input.keywords && !input.identifiers) {
        const errorResult = { error: 'Either keywords or identifiers must be provided' };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(errorResult, null, 2) }],
          structuredContent: errorResult,
        };
      }

      const queryParams: Record<string, unknown> = {
        marketplaceIds: marketplaceId,
        includedData: input.includedData,
        pageSize: Math.min(input.pageSize || 10, 20),
      };

      if (input.keywords) queryParams.keywords = input.keywords;
      if (input.identifiers) queryParams.identifiers = input.identifiers;
      if (input.identifiersType) queryParams.identifiersType = input.identifiersType;
      if (input.pageToken) queryParams.pageToken = input.pageToken;

      const response = await client.get<SearchCatalogItemsResponse>(
        '/catalog/2022-04-01/items',
        queryParams,
        { rateLimitCategory: 'catalog' }
      );

      const items = response.items || [];

      const result = {
        totalResults: response.numberOfResults || items.length,
        hasMore: !!response.pagination?.nextToken,
        nextToken: response.pagination?.nextToken,
        items: items.map((item) => {
          const summary = item.summaries?.find(
            (s) => s.marketplaceId === marketplaceId
          ) || item.summaries?.[0];

          return {
            asin: item.asin,
            title: summary?.itemName,
            brand: summary?.brand,
            classification: summary?.classificationType
              ? {
                  type: summary.classificationType,
                  displayName: summary.classificationDisplayName,
                }
              : undefined,
            color: summary?.color,
            size: summary?.size,
          };
        }),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );
}
