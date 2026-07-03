import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerOrderTools } from './orders.js';
import { registerInventoryTools } from './inventory.js';
import { registerSalesTools } from './sales.js';
import { registerCatalogTools } from './catalog.js';
import { registerFinanceTools } from './finances.js';
import { registerInvoicesTools } from './invoices.js';
import { registerFeesTools } from './fees.js';
import { registerFeedbackTools } from './feedback.js';
import { registerListingsTools } from './listings.js';
import { registerPricingTools } from './pricing.js';
import { registerSolicitationsTools } from './solicitations.js';
import { registerFBAInboundTools } from './fba-inbound.js';
import { registerTokensTools } from './tokens.js';
import { registerMerchantFulfillmentTools } from './merchant-fulfillment.js';
import { registerDataKioskTools } from './data-kiosk.js';
import { registerAllReportTools } from './reports/index.js';

export function registerAllTools(server: McpServer): void {
  registerOrderTools(server);
  registerInventoryTools(server);
  registerSalesTools(server);
  registerCatalogTools(server);
  registerFinanceTools(server);
  registerInvoicesTools(server);
  registerFeesTools(server);
  registerFeedbackTools(server);
  registerListingsTools(server);
  registerPricingTools(server);
  registerSolicitationsTools(server);
  registerFBAInboundTools(server);
  registerTokensTools(server);
  registerMerchantFulfillmentTools(server);
  registerDataKioskTools(server);
  registerAllReportTools(server);
}

export {
  registerOrderTools,
  registerInventoryTools,
  registerSalesTools,
  registerCatalogTools,
  registerFinanceTools,
  registerInvoicesTools,
  registerFeesTools,
  registerFeedbackTools,
  registerListingsTools,
  registerPricingTools,
  registerSolicitationsTools,
  registerFBAInboundTools,
  registerTokensTools,
  registerMerchantFulfillmentTools,
  registerDataKioskTools,
  registerAllReportTools,
};
