import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReportTool } from './_factory.js';
import { REPORT_TYPES } from '../../types/sp-api.js';

const dateRangeSchema = z.object({
  startDate: z.string().describe('Start date in YYYY-MM-DD format'),
  endDate: z.string().describe('End date in YYYY-MM-DD format'),
});

type DateRangeInput = z.infer<typeof dateRangeSchema>;

// FBA Customer Returns record type
interface CustomerReturnsRecord {
  return_date: string;
  order_id: string;
  sku: string;
  asin: string;
  fnsku: string;
  product_name: string;
  quantity: string;
  fulfillment_center_id: string;
  detailed_disposition: string;
  reason: string;
  status: string;
  license_plate_number: string;
  customer_comments: string;
}

// FBA Inventory Planning record type
interface InventoryPlanningRecord {
  sku: string;
  asin: string;
  fnsku: string;
  product_name: string;
  condition: string;
  available_quantity: string;
  inbound_quantity: string;
  reserved_quantity: string;
  research_quantity: string;
  future_supply_buyable: string;
  pending_trans_quantity: string;
  total_inbound_quantity: string;
  days_of_supply: string;
  recommended_action: string;
  recommended_order_qty: string;
  recommended_order_date: string;
}

// Flat File All Orders record type
interface AllOrdersRecord {
  order_id: string;
  order_status: string;
  order_date: string;
  sku: string;
  asin: string;
  product_name: string;
  quantity: string;
  item_price: string;
  item_tax: string;
  shipping_price: string;
  shipping_tax: string;
  gift_wrap_price: string;
  gift_wrap_tax: string;
  ship_country: string;
}

// Brand Analytics Market Basket record type
interface MarketBasketRecord {
  reporting_date: string;
  product_asin: string;
  product_title: string;
  purchased_asin_1: string;
  purchased_product_title_1: string;
  combination_percentage_1: string;
  purchased_asin_2: string;
  purchased_product_title_2: string;
  combination_percentage_2: string;
  purchased_asin_3: string;
  purchased_product_title_3: string;
  combination_percentage_3: string;
}

// Brand Analytics Repeat Purchase record type
interface RepeatPurchaseRecord {
  reporting_date: string;
  search_term: string;
  brand_name: string;
  unique_customers: string;
  repeat_customers: string;
  repeat_purchase_rate: string;
}

// Inventory Ledger Detail record type
interface InventoryLedgerDetailRecord {
  date: string;
  fnsku: string;
  asin: string;
  msku: string;
  title: string;
  disposition: string;
  event_type: string;
  quantity: string;
  reference_id: string;
  location: string;
}

function summarizeCustomerReturns(records: CustomerReturnsRecord[], input: DateRangeInput) {
  const byReason = records.reduce(
    (acc, r) => {
      const reason = r.reason || 'Unknown';
      if (!acc[reason]) {
        acc[reason] = { count: 0, quantity: 0 };
      }
      acc[reason].count++;
      acc[reason].quantity += parseInt(r.quantity) || 0;
      return acc;
    },
    {} as Record<string, { count: number; quantity: number }>
  );

  const bySku = records.reduce(
    (acc, r) => {
      const sku = r.sku || 'Unknown';
      if (!acc[sku]) {
        acc[sku] = { count: 0, quantity: 0, productName: r.product_name };
      }
      acc[sku].count++;
      acc[sku].quantity += parseInt(r.quantity) || 0;
      return acc;
    },
    {} as Record<string, { count: number; quantity: number; productName: string }>
  );

  return {
    summary: {
      dateRange: { start: input.startDate, end: input.endDate },
      totalReturns: records.length,
      totalQuantityReturned: records.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0),
    },
    byReason: Object.entries(byReason)
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        quantity: data.quantity,
      }))
      .sort((a, b) => b.count - a.count),
    bySku: Object.entries(bySku)
      .map(([sku, data]) => ({
        sku,
        productName: data.productName,
        count: data.count,
        quantity: data.quantity,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    recentReturns: records.slice(0, 50).map((r) => ({
      returnDate: r.return_date,
      orderId: r.order_id,
      sku: r.sku,
      asin: r.asin,
      productName: r.product_name,
      quantity: r.quantity,
      reason: r.reason,
      status: r.status,
      fulfillmentCenter: r.fulfillment_center_id,
    })),
  };
}

function summarizeInventoryPlanning(records: InventoryPlanningRecord[]) {
  const totalAvailable = records.reduce((sum, r) => sum + (parseInt(r.available_quantity) || 0), 0);
  const totalInbound = records.reduce((sum, r) => sum + (parseInt(r.inbound_quantity) || 0), 0);
  const totalReserved = records.reduce((sum, r) => sum + (parseInt(r.reserved_quantity) || 0), 0);

  const lowStock = records
    .filter((r) => {
      const days = parseInt(r.days_of_supply) || 0;
      return days >= 0 && days <= 30;
    })
    .map((r) => ({
      sku: r.sku,
      asin: r.asin,
      productName: r.product_name,
      availableQuantity: r.available_quantity,
      daysOfSupply: r.days_of_supply,
      recommendedOrderQty: r.recommended_order_qty,
      recommendedOrderDate: r.recommended_order_date,
      recommendedAction: r.recommended_action,
    }))
    .slice(0, 20);

  return {
    summary: {
      totalSkus: records.length,
      totalAvailable,
      totalInbound,
      totalReserved,
      lowStockCount: lowStock.length,
    },
    lowStock,
    planningDetails: records.slice(0, 50).map((r) => ({
      sku: r.sku,
      asin: r.asin,
      productName: r.product_name,
      condition: r.condition,
      availableQuantity: r.available_quantity,
      inboundQuantity: r.inbound_quantity,
      reservedQuantity: r.reserved_quantity,
      totalInbound: r.total_inbound_quantity,
      daysOfSupply: r.days_of_supply,
      recommendedAction: r.recommended_action,
      recommendedOrderQty: r.recommended_order_qty,
      recommendedOrderDate: r.recommended_order_date,
    })),
  };
}

function summarizeAllOrders(records: AllOrdersRecord[], input: DateRangeInput) {
  const totalRevenue = records.reduce((sum, r) => sum + (parseFloat(r.item_price) || 0), 0);
  const totalQuantity = records.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
  const uniqueOrders = new Set(records.map((r) => r.order_id)).size;

  const byStatus = records.reduce(
    (acc, r) => {
      const status = r.order_status || 'Unknown';
      if (!acc[status]) {
        acc[status] = { count: 0, quantity: 0, revenue: 0 };
      }
      acc[status].count++;
      acc[status].quantity += parseInt(r.quantity) || 0;
      acc[status].revenue += parseFloat(r.item_price) || 0;
      return acc;
    },
    {} as Record<string, { count: number; quantity: number; revenue: number }>
  );

  const bySku = records.reduce(
    (acc, r) => {
      const sku = r.sku || 'Unknown';
      if (!acc[sku]) {
        acc[sku] = { count: 0, quantity: 0, revenue: 0, productName: r.product_name };
      }
      acc[sku].count++;
      acc[sku].quantity += parseInt(r.quantity) || 0;
      acc[sku].revenue += parseFloat(r.item_price) || 0;
      return acc;
    },
    {} as Record<string, { count: number; quantity: number; revenue: number; productName: string }>
  );

  return {
    summary: {
      dateRange: { start: input.startDate, end: input.endDate },
      totalOrders: uniqueOrders,
      totalOrderItems: records.length,
      totalQuantity,
      totalRevenue: totalRevenue.toFixed(2),
    },
    byStatus: Object.entries(byStatus)
      .map(([status, data]) => ({
        status,
        count: data.count,
        quantity: data.quantity,
        revenue: data.revenue.toFixed(2),
      }))
      .sort((a, b) => b.count - a.count),
    bySku: Object.entries(bySku)
      .map(([sku, data]) => ({
        sku,
        productName: data.productName,
        count: data.count,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20)
      .map(({ revenue, ...rest }) => ({ ...rest, revenue: revenue.toFixed(2) })),
    recentOrders: records.slice(0, 50).map((r) => ({
      orderId: r.order_id,
      orderDate: r.order_date,
      orderStatus: r.order_status,
      sku: r.sku,
      asin: r.asin,
      productName: r.product_name,
      quantity: r.quantity,
      itemPrice: r.item_price,
      shipCountry: r.ship_country,
    })),
  };
}

function summarizeMarketBasket(records: MarketBasketRecord[], input: DateRangeInput) {
  const byProduct = records.reduce(
    (acc, r) => {
      const asin = r.product_asin || 'Unknown';
      if (!acc[asin]) {
        acc[asin] = { title: r.product_title, pairs: [] as Array<{ asin: string; title: string; percentage: string }> };
      }

      const pairs: Array<{ asin: string; title: string; percentage: string }> = [];
      if (r.purchased_asin_1) {
        pairs.push({
          asin: r.purchased_asin_1,
          title: r.purchased_product_title_1,
          percentage: r.combination_percentage_1,
        });
      }
      if (r.purchased_asin_2) {
        pairs.push({
          asin: r.purchased_asin_2,
          title: r.purchased_product_title_2,
          percentage: r.combination_percentage_2,
        });
      }
      if (r.purchased_asin_3) {
        pairs.push({
          asin: r.purchased_asin_3,
          title: r.purchased_product_title_3,
          percentage: r.combination_percentage_3,
        });
      }

      acc[asin].pairs.push(...pairs);
      return acc;
    },
    {} as Record<string, { title: string; pairs: Array<{ asin: string; title: string; percentage: string }> }>
  );

  return {
    summary: {
      dateRange: { start: input.startDate, end: input.endDate },
      totalMarketBaskets: records.length,
      productsWithBaskets: Object.keys(byProduct).length,
    },
    marketBaskets: Object.entries(byProduct)
      .map(([asin, data]) => ({
        asin,
        title: data.title,
        frequentlyPurchasedWith: data.pairs
          .sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage))
          .slice(0, 5),
      }))
      .slice(0, 50),
  };
}

function summarizeRepeatPurchase(records: RepeatPurchaseRecord[], input: DateRangeInput) {
  const bySearchTerm = records.reduce(
    (acc, r) => {
      const term = r.search_term || 'Unknown';
      if (!acc[term]) {
        acc[term] = { uniqueCustomers: 0, repeatCustomers: 0, weightedRateSum: 0, count: 0 };
      }
      acc[term].uniqueCustomers += parseInt(r.unique_customers) || 0;
      acc[term].repeatCustomers += parseInt(r.repeat_customers) || 0;
      acc[term].weightedRateSum += parseFloat(r.repeat_purchase_rate) || 0;
      acc[term].count++;
      return acc;
    },
    {} as Record<string, { uniqueCustomers: number; repeatCustomers: number; weightedRateSum: number; count: number }>
  );

  return {
    summary: {
      dateRange: { start: input.startDate, end: input.endDate },
      totalSearchTerms: Object.keys(bySearchTerm).length,
      totalRecords: records.length,
    },
    bySearchTerm: Object.entries(bySearchTerm)
      .map(([searchTerm, data]) => ({
        searchTerm,
        uniqueCustomers: data.uniqueCustomers,
        repeatCustomers: data.repeatCustomers,
        repeatPurchaseRate:
          data.uniqueCustomers > 0
            ? ((data.repeatCustomers / data.uniqueCustomers) * 100).toFixed(2) + '%'
            : '0.00%',
      }))
      .sort((a, b) => parseFloat(b.repeatPurchaseRate) - parseFloat(a.repeatPurchaseRate))
      .slice(0, 50),
    repeatPurchaseDetails: records.slice(0, 50).map((r) => ({
      reportingDate: r.reporting_date,
      searchTerm: r.search_term,
      brandName: r.brand_name,
      uniqueCustomers: r.unique_customers,
      repeatCustomers: r.repeat_customers,
      repeatPurchaseRate: r.repeat_purchase_rate,
    })),
  };
}

function summarizeInventoryLedgerDetail(records: InventoryLedgerDetailRecord[], input: DateRangeInput) {
  const byEventType = records.reduce(
    (acc, r) => {
      const eventType = r.event_type || 'Unknown';
      if (!acc[eventType]) {
        acc[eventType] = { count: 0, quantity: 0 };
      }
      acc[eventType].count++;
      acc[eventType].quantity += parseInt(r.quantity) || 0;
      return acc;
    },
    {} as Record<string, { count: number; quantity: number }>
  );

  const byAsin = records.reduce(
    (acc, r) => {
      const asin = r.asin || 'Unknown';
      if (!acc[asin]) {
        acc[asin] = { title: r.title, netQuantity: 0 };
      }
      acc[asin].netQuantity += parseInt(r.quantity) || 0;
      return acc;
    },
    {} as Record<string, { title: string; netQuantity: number }>
  );

  return {
    summary: {
      dateRange: { start: input.startDate, end: input.endDate },
      totalTransactions: records.length,
      byEventType,
    },
    byAsin: Object.entries(byAsin)
      .map(([asin, data]) => ({
        asin,
        title: data.title,
        netQuantity: data.netQuantity,
      }))
      .sort((a, b) => Math.abs(b.netQuantity) - Math.abs(a.netQuantity))
      .slice(0, 30),
    ledgerDetails: records.slice(0, 50).map((r) => ({
      date: r.date,
      fnsku: r.fnsku,
      asin: r.asin,
      msku: r.msku,
      title: r.title,
      disposition: r.disposition,
      eventType: r.event_type,
      quantity: r.quantity,
      referenceId: r.reference_id,
      location: r.location,
    })),
  };
}

export function registerAdditionalReportTools(server: McpServer): void {
  registerReportTool<DateRangeInput, CustomerReturnsRecord>(
    server,
    'get_fba_customer_returns',
    {
      description:
        'Get FBA customer returns data within a date range. Shows return reasons, quantities, and affected SKUs. Useful for identifying quality issues or product dissatisfaction trends.',
      reportType: REPORT_TYPES.FBA_RETURNS,
      inputSchema: dateRangeSchema,
      summary: summarizeCustomerReturns,
      pollOptions: {
        maxWaitMs: 300000,
        pollIntervalMs: 15000,
      },
      csvOptions: { delimiter: '\t' },
    }
  );

  registerReportTool<DateRangeInput, InventoryPlanningRecord>(
    server,
    'get_fba_inventory_planning',
    {
      description:
        'Get FBA inventory planning data including days of supply, recommended replenishments, and inbound quantities. Helps optimize inventory levels and avoid stockouts.',
      reportType: REPORT_TYPES.FBA_INVENTORY_PLANNING,
      inputSchema: dateRangeSchema,
      summary: summarizeInventoryPlanning,
      pollOptions: {
        maxWaitMs: 300000,
        pollIntervalMs: 15000,
      },
      csvOptions: { delimiter: '\t' },
    }
  );

  registerReportTool<DateRangeInput, AllOrdersRecord>(
    server,
    'get_all_orders_report',
    {
      description:
        'Get a comprehensive flat-file report of all orders within a date range. Includes order IDs, SKUs, quantities, prices, and shipping details.',
      reportType: REPORT_TYPES.FLAT_FILE_ALL_ORDERS,
      inputSchema: dateRangeSchema,
      summary: summarizeAllOrders,
      pollOptions: {
        maxWaitMs: 300000,
        pollIntervalMs: 15000,
      },
      csvOptions: { delimiter: '\t' },
    }
  );

  registerReportTool<DateRangeInput, MarketBasketRecord>(
    server,
    'get_market_basket_report',
    {
      description:
        'Get Brand Analytics market basket report showing products frequently purchased together. Requires Brand Registry. Helps identify cross-selling and bundling opportunities.',
      reportType: REPORT_TYPES.BRAND_ANALYTICS_MARKET_BASKET,
      inputSchema: dateRangeSchema,
      summary: summarizeMarketBasket,
      pollOptions: {
        maxWaitMs: 300000,
        pollIntervalMs: 15000,
      },
      csvOptions: { delimiter: '\t' },
    }
  );

  registerReportTool<DateRangeInput, RepeatPurchaseRecord>(
    server,
    'get_repeat_purchase_report',
    {
      description:
        'Get Brand Analytics repeat purchase report showing customer loyalty metrics by search term. Requires Brand Registry. Helps understand repeat purchase behavior.',
      reportType: REPORT_TYPES.BRAND_ANALYTICS_REPEAT_PURCHASE,
      inputSchema: dateRangeSchema,
      summary: summarizeRepeatPurchase,
      pollOptions: {
        maxWaitMs: 300000,
        pollIntervalMs: 15000,
      },
      csvOptions: { delimiter: '\t' },
    }
  );

  registerReportTool<DateRangeInput, InventoryLedgerDetailRecord>(
    server,
    'get_inventory_ledger_detail',
    {
      description:
        'Get detailed inventory ledger transactions including event types, quantities, and reference IDs. Provides granular visibility into inventory movements.',
      reportType: REPORT_TYPES.FBA_INVENTORY_LEDGER_DETAIL,
      inputSchema: dateRangeSchema,
      summary: summarizeInventoryLedgerDetail,
      pollOptions: {
        maxWaitMs: 300000,
        pollIntervalMs: 15000,
      },
      csvOptions: { delimiter: '\t' },
    }
  );
}
