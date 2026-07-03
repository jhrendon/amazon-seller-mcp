import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { marketplaceIdSchema } from './_shared/schemas.js';
import { makeToolResponse } from './_shared/response.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import type {
  CreateInboundPlanRequest,
  CreateInboundPlanResponse,
  InboundAddress,
  InboundItem,
  InboundPlan,
  InboundShipment,
  ListInboundPlanShipmentsResponse,
  ListInboundPlansResponse,
} from '../types/sp-api.js';

const inboundPlanIdSchema = z
  .string()
  .min(1)
  .describe('FBA inbound plan ID');

const shipmentIdSchema = z
  .string()
  .min(1)
  .describe('FBA inbound shipment ID');

const listInboundPlansSchema = z.object({
  status: z.string().optional().describe('Filter by plan status'),
  sortBy: z.string().optional().describe('Field to sort by'),
  sortOrder: z.enum(['ASC', 'DESC']).optional(),
  pageSize: z.number().int().positive().optional().describe('Results per page'),
  paginationToken: z.string().optional().describe('Pagination token'),
  nextToken: z.string().optional().describe('Alias for paginationToken'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const getInboundPlanSchema = z.object({
  inboundPlanId: inboundPlanIdSchema,
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const createInboundPlanSchema = z.object({
  marketplaceId: marketplaceIdSchema,
  originAddress: z.object({
    name: z.string().optional(),
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    addressLine3: z.string().optional(),
    city: z.string().optional(),
    stateOrRegion: z.string().optional(),
    postalCode: z.string().optional(),
    countryCode: z.string().length(2).optional(),
    phone: z.string().optional(),
  }),
  items: z
    .array(
      z.object({
        asin: z.string().optional(),
        sellerSku: z.string().optional(),
        msKU: z.string().optional(),
        quantity: z.number().int().positive(),
        labelOwner: z.enum(['AMAZON', 'SELLER']).optional(),
        prepOwner: z.enum(['AMAZON', 'SELLER']).optional(),
        expiration: z.string().optional().describe('ISO 8601 expiration date'),
        manufacturingLotCode: z.string().optional(),
      })
    )
    .min(1)
    .describe('Inbound items (at least one required)'),
});

const listInboundPlanShipmentsSchema = z.object({
  inboundPlanId: inboundPlanIdSchema,
  pageSize: z.number().int().positive().optional(),
  paginationToken: z.string().optional(),
  nextToken: z.string().optional(),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const getInboundShipmentSchema = z.object({
  inboundPlanId: inboundPlanIdSchema,
  shipmentId: shipmentIdSchema,
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

function toInboundAddress(input: z.infer<typeof createInboundPlanSchema>['originAddress']): InboundAddress {
  return {
    name: input.name,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    addressLine3: input.addressLine3,
    city: input.city,
    stateOrRegion: input.stateOrRegion,
    postalCode: input.postalCode,
    countryCode: input.countryCode,
    phone: input.phone,
  };
}

function toInboundItems(
  inputs: z.infer<typeof createInboundPlanSchema>['items']
): InboundItem[] {
  return inputs.map((item) => ({
    asin: item.asin,
    sellerSku: item.sellerSku,
    msKU: item.msKU,
    quantity: item.quantity,
    labelOwner: item.labelOwner,
    prepOwner: item.prepOwner,
    expiration: item.expiration,
    manufacturingLotCode: item.manufacturingLotCode,
  }));
}

export function registerFBAInboundTools(server: McpServer): void {
  server.registerTool(
    'list_inbound_plans',
    {
      description: 'List FBA inbound plans for the seller account with pagination support.',
      inputSchema: listInboundPlansSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const params: Record<string, unknown> = { marketplaceId };
      if (input.status) params.status = input.status;
      if (input.sortBy) params.sortBy = input.sortBy;
      if (input.sortOrder) params.sortOrder = input.sortOrder;
      if (input.pageSize) params.pageSize = input.pageSize;
      if (input.paginationToken) params.paginationToken = input.paginationToken;
      if (input.nextToken) params.paginationToken = input.nextToken;

      const response = await client.get<ListInboundPlansResponse>(
        '/inbound/fba/2024-03-20/inboundPlans',
        params,
        { rateLimitCategory: 'fbaInbound' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'get_inbound_plan',
    {
      description: 'Get detailed information about a specific FBA inbound plan.',
      inputSchema: getInboundPlanSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const response = await client.get<InboundPlan>(
        `/inbound/fba/2024-03-20/inboundPlans/${encodeURIComponent(input.inboundPlanId)}`,
        { marketplaceId },
        { rateLimitCategory: 'fbaInbound' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'create_inbound_plan',
    {
      description:
        'Create a new FBA inbound plan with a source address and a list of items. Returns the created inbound plan ID.',
      inputSchema: createInboundPlanSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const request: CreateInboundPlanRequest = {
        marketplaceId,
        originAddress: toInboundAddress(input.originAddress),
        items: toInboundItems(input.items),
      };

      const response = await client.post<CreateInboundPlanResponse>(
        '/inbound/fba/2024-03-20/inboundPlans',
        request,
        { rateLimitCategory: 'fbaInbound' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'list_inbound_plan_shipments',
    {
      description: 'List shipments for a specific FBA inbound plan.',
      inputSchema: listInboundPlanShipmentsSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const params: Record<string, unknown> = { marketplaceId };
      if (input.pageSize) params.pageSize = input.pageSize;
      if (input.paginationToken) params.paginationToken = input.paginationToken;
      if (input.nextToken) params.paginationToken = input.nextToken;

      const response = await client.get<ListInboundPlanShipmentsResponse>(
        `/inbound/fba/2024-03-20/inboundPlans/${encodeURIComponent(input.inboundPlanId)}/shipments`,
        params,
        { rateLimitCategory: 'fbaInbound' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'get_inbound_shipment',
    {
      description: 'Get detailed information about a specific FBA inbound shipment.',
      inputSchema: getInboundShipmentSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const response = await client.get<InboundShipment>(
        `/inbound/fba/2024-03-20/inboundPlans/${encodeURIComponent(input.inboundPlanId)}/shipments/${encodeURIComponent(input.shipmentId)}`,
        { marketplaceId },
        { rateLimitCategory: 'fbaInbound' }
      );

      return makeToolResponse(response);
    }
  );
}
