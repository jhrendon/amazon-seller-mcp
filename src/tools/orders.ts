import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { orderIdSchema, marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import type { GetOrdersResponse, GetOrderResponse, GetOrderItemsResponse, Order } from '../types/sp-api.js';

// Input schemas
const getOrdersSchema = z.object({
  createdAfter: z.string().optional().describe('ISO 8601 date. Orders created after this date'),
  createdBefore: z.string().optional().describe('ISO 8601 date. Orders created before this date'),
  lastUpdatedAfter: z.string().optional().describe('ISO 8601 date. Orders updated after this date'),
  lastUpdatedBefore: z.string().optional().describe('ISO 8601 date. Orders updated before this date'),
  orderStatuses: z
    .array(z.string())
    .optional()
    .describe('Filter by order status: Pending, Unshipped, PartiallyShipped, Shipped, Canceled'),
  fulfillmentChannels: z
    .array(z.enum(['AFN', 'MFN']))
    .optional()
    .describe('AFN (Fulfilled by Amazon) or MFN (Merchant Fulfilled)'),
  maxResults: z.number().optional().default(100).describe('Maximum number of orders to return (max 100)'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

const getOrderDetailsSchema = z.object({
  orderId: orderIdSchema,
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
  restrictedDataToken: z
    .string()
    .optional()
    .describe('Restricted data token (RDT) to access PII such as shippingAddress and buyerInfo'),
});

const getOrderItemsSchema = z.object({
  orderId: orderIdSchema,
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

export function registerOrderTools(server: McpServer): void {
  server.registerTool(
    'get_orders',
    {
      description:
        'Retrieve a list of orders from Amazon Seller Central. You can filter by date range, status, and fulfillment channel. Returns order summaries including order ID, status, total, and buyer info.',
      inputSchema: getOrdersSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      // Pagination: fetch orders up to maxResults cap
      const maxResults = input.maxResults || 100;
      const allOrders: Order[] = [];
      let nextToken: string | undefined;
      const maxPages = 20; // Safety limit
      let page = 0;

      do {
        const remaining = maxResults - allOrders.length;
        const pageSize = Math.min(remaining, 100);

        const queryParams: Record<string, unknown> = {
          MarketplaceIds: marketplaceId,
          MaxResultsPerPage: pageSize,
        };

        if (nextToken) queryParams.NextToken = nextToken;
        if (input.createdAfter) queryParams.CreatedAfter = input.createdAfter;
        if (input.createdBefore) queryParams.CreatedBefore = input.createdBefore;
        if (input.lastUpdatedAfter) queryParams.LastUpdatedAfter = input.lastUpdatedAfter;
        if (input.lastUpdatedBefore) queryParams.LastUpdatedBefore = input.lastUpdatedBefore;
        if (input.orderStatuses) queryParams.OrderStatuses = input.orderStatuses.join(',');
        if (input.fulfillmentChannels)
          queryParams.FulfillmentChannels = input.fulfillmentChannels.join(',');

        const response = await client.get<GetOrdersResponse>('/orders/v0/orders', queryParams, {
          rateLimitCategory: 'orders',
        });

        const orders = response.payload.Orders || [];
        allOrders.push(...orders);
        nextToken = response.payload.NextToken;
        page++;
      } while (nextToken && page < maxPages && allOrders.length < maxResults);

      // Trim to exact maxResults in case the last page returned more than needed
      if (allOrders.length > maxResults) {
        allOrders.length = maxResults;
      }

      const summary = {
        totalOrders: allOrders.length,
        pagesFetched: page,
        hasMore: !!nextToken,
        orders: allOrders.map((order) => ({
          orderId: order.AmazonOrderId,
          status: order.OrderStatus,
          purchaseDate: order.PurchaseDate,
          lastUpdateDate: order.LastUpdateDate,
          fulfillmentChannel: order.FulfillmentChannel,
          salesChannel: order.SalesChannel,
          orderTotal: order.OrderTotal,
          numberOfItemsShipped: order.NumberOfItemsShipped,
          numberOfItemsUnshipped: order.NumberOfItemsUnshipped,
          isPrime: order.IsPrime,
          isBusinessOrder: order.IsBusinessOrder,
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    }
  );

  server.registerTool(
    'get_order_details',
    {
      description:
        'Get detailed information about a specific Amazon order by order ID. Returns full order details including shipping address, buyer info, and order status.',
      inputSchema: getOrderDetailsSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const requestOptions: { rateLimitCategory: string; accessToken?: string } = {
        rateLimitCategory: 'orders',
      };
      if (input.restrictedDataToken) {
        requestOptions.accessToken = input.restrictedDataToken;
      }

      const response = await client.get<GetOrderResponse>(
        `/orders/v0/orders/${encodeURIComponent(input.orderId)}`,
        undefined,
        requestOptions
      );

      const order = response.payload;

      const summary = {
        orderId: order.AmazonOrderId,
        sellerOrderId: order.SellerOrderId,
        status: order.OrderStatus,
        purchaseDate: order.PurchaseDate,
        lastUpdateDate: order.LastUpdateDate,
        fulfillmentChannel: order.FulfillmentChannel,
        salesChannel: order.SalesChannel,
        orderTotal: order.OrderTotal,
        paymentMethod: order.PaymentMethod,
        numberOfItemsShipped: order.NumberOfItemsShipped,
        numberOfItemsUnshipped: order.NumberOfItemsUnshipped,
        isPrime: order.IsPrime,
        isBusinessOrder: order.IsBusinessOrder,
        shippingAddress: order.ShippingAddress,
        buyerInfo: order.BuyerInfo,
        earliestShipDate: order.EarliestShipDate,
        latestShipDate: order.LatestShipDate,
        earliestDeliveryDate: order.EarliestDeliveryDate,
        latestDeliveryDate: order.LatestDeliveryDate,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    }
  );

  server.registerTool(
    'get_order_items',
    {
      description:
        'Get the line items (products) for a specific Amazon order. Returns details about each item including ASIN, SKU, quantity, price, and tax.',
      inputSchema: getOrderItemsSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const allItems: NonNullable<GetOrderItemsResponse['payload']['OrderItems']> = [];
      let nextToken: string | undefined;
      const maxPages = 20; // Safety limit
      let page = 0;
      let orderId = input.orderId;

      do {
        const queryParams: Record<string, unknown> = {};
        if (nextToken) queryParams.NextToken = nextToken;

        const response = await client.get<GetOrderItemsResponse>(
          `/orders/v0/orders/${encodeURIComponent(input.orderId)}/orderItems`,
          Object.keys(queryParams).length > 0 ? queryParams : undefined,
          { rateLimitCategory: 'orderItems' }
        );

        const items = response.payload.OrderItems || [];
        allItems.push(...items);
        nextToken = response.payload.NextToken;
        orderId = response.payload.AmazonOrderId || orderId;
        page++;
      } while (nextToken && page < maxPages);

      const summary = {
        orderId,
        totalItems: allItems.length,
        items: allItems.map((item) => ({
          orderItemId: item.OrderItemId,
          asin: item.ASIN,
          sellerSku: item.SellerSKU,
          title: item.Title,
          quantityOrdered: item.QuantityOrdered,
          quantityShipped: item.QuantityShipped,
          itemPrice: item.ItemPrice,
          itemTax: item.ItemTax,
          shippingPrice: item.ShippingPrice,
          shippingTax: item.ShippingTax,
          promotionDiscount: item.PromotionDiscount,
          isGift: item.IsGift,
          conditionId: item.ConditionId,
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    }
  );
}
