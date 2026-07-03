import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { makeToolResponse } from './_shared/response.js';
import { marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import type {
  Address,
  CancelShipmentResponse,
  CreateShipmentRequest,
  CreateShipmentResponse,
  CurrencyAmount,
  GetEligibleShippingServicesRequest,
  GetEligibleShippingServicesResponse,
  GetShipmentResponse,
  PackageDimensions,
  ShipmentRequestDetails,
  ShippingServiceOptions,
  Weight,
} from '../types/sp-api.js';

const addressSchema = z.object({
  name: z.string().optional(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  addressLine3: z.string().optional(),
  city: z.string().min(1),
  stateOrRegion: z.string().min(1),
  postalCode: z.string().min(1),
  countryCode: z.string().length(2),
  phone: z.string().optional(),
});

const shipmentItemSchema = z.object({
  orderItemId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const packageDimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['inches', 'centimeters']),
});

const weightSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(['ounces', 'grams', 'pounds', 'kilograms']),
});

const currencyAmountSchema = z.object({
  currencyCode: z.string().length(3),
  amount: z.number(),
});

const shippingServiceOptionsSchema = z.object({
  deliveryExperience: z.enum([
    'DeliveryConfirmationWithAdultSignature',
    'DeliveryConfirmationWithSignature',
    'DeliveryConfirmationWithoutSignature',
    'NoTracking',
  ]),
  declaredValue: currencyAmountSchema.optional(),
  carrierWillPickUp: z.boolean().optional(),
  labelFormat: z
    .enum(['PDF', 'PNG', 'ZPL203', 'ZPL300', 'ShippingServiceDefault'])
    .optional(),
});

const shipmentRequestDetailsSchema = z.object({
  amazonOrderId: z.string().min(1),
  sellerOrderId: z.string().optional(),
  itemList: z.array(shipmentItemSchema).optional(),
  shipFromAddress: addressSchema,
  packageDimensions: packageDimensionsSchema,
  weight: weightSchema,
  mustArriveByDate: z.string().optional(),
  shipDate: z.string().optional(),
  shippingServiceOptions: shippingServiceOptionsSchema,
  labelCustomization: z.record(z.unknown()).optional(),
});

const getEligibleShippingServicesSchema = z.object({
  shipmentRequestDetails: shipmentRequestDetailsSchema,
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const createShipmentSchema = z.object({
  shipmentRequestDetails: shipmentRequestDetailsSchema,
  shippingServiceId: z.string().min(1),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const shipmentIdSchema = z.object({
  shipmentId: z.string().min(1),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

function toCurrencyAmount(input?: z.infer<typeof currencyAmountSchema>): CurrencyAmount | undefined {
  if (!input) return undefined;
  return {
    currencyCode: input.currencyCode,
    amount: input.amount,
  };
}

function toShippingServiceOptions(
  input: z.infer<typeof shippingServiceOptionsSchema>
): ShippingServiceOptions {
  return {
    deliveryExperience: input.deliveryExperience,
    declaredValue: toCurrencyAmount(input.declaredValue),
    carrierWillPickUp: input.carrierWillPickUp,
    labelFormat: input.labelFormat,
  };
}

function toShipmentRequestDetails(
  input: z.infer<typeof shipmentRequestDetailsSchema>
): ShipmentRequestDetails {
  return {
    amazonOrderId: input.amazonOrderId,
    sellerOrderId: input.sellerOrderId,
    itemList: input.itemList,
    shipFromAddress: input.shipFromAddress as Address,
    packageDimensions: input.packageDimensions as PackageDimensions,
    weight: input.weight as Weight,
    mustArriveByDate: input.mustArriveByDate,
    shipDate: input.shipDate,
    shippingServiceOptions: toShippingServiceOptions(input.shippingServiceOptions),
    labelCustomization: input.labelCustomization,
  };
}

export function registerMerchantFulfillmentTools(server: McpServer): void {
  server.registerTool(
    'get_eligible_shipping_services',
    {
      description:
        'Get eligible shipping services for a merchant-fulfilled order, including rates and delivery promises.',
      inputSchema: getEligibleShippingServicesSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const request: GetEligibleShippingServicesRequest = {
        shipmentRequestDetails: toShipmentRequestDetails(input.shipmentRequestDetails),
      };

      const response = await client.post<GetEligibleShippingServicesResponse>(
        '/mfn/v0/eligibleShippingServices',
        request,
        { rateLimitCategory: 'merchantFulfillment' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'create_shipment',
    {
      description:
        'Create a merchant fulfillment shipment (purchase a shipping label) for an order.',
      inputSchema: createShipmentSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const request: CreateShipmentRequest = {
        shipmentRequestDetails: toShipmentRequestDetails(input.shipmentRequestDetails),
        shippingServiceId: input.shippingServiceId,
      };

      const response = await client.post<CreateShipmentResponse>(
        '/mfn/v0/shipments',
        request,
        { rateLimitCategory: 'merchantFulfillment' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'get_shipment',
    {
      description: 'Get details of a merchant fulfillment shipment, including tracking and label information.',
      inputSchema: shipmentIdSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const response = await client.get<GetShipmentResponse>(
        `/mfn/v0/shipments/${encodeURIComponent(input.shipmentId)}`,
        undefined,
        { rateLimitCategory: 'merchantFulfillment' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'cancel_shipment',
    {
      description: 'Cancel a merchant fulfillment shipment before the label is printed.',
      inputSchema: shipmentIdSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const response = await client.delete<CancelShipmentResponse>(
        `/mfn/v0/shipments/${encodeURIComponent(input.shipmentId)}`,
        { rateLimitCategory: 'merchantFulfillment' }
      );

      return makeToolResponse(response);
    }
  );
}
