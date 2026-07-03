import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerReimbursementTools } from './reimbursements.js';
import { registerSettlementTools } from './settlements.js';
import { registerFeeTools } from './fees.js';
import { registerAnalyticsTools } from './analytics.js';
import { registerAdditionalReportTools } from './additional-reports.js';

export function registerAllReportTools(server: McpServer): void {
  registerReimbursementTools(server);
  registerSettlementTools(server);
  registerFeeTools(server);
  registerAnalyticsTools(server);
  registerAdditionalReportTools(server);
}

export {
  registerReimbursementTools,
  registerSettlementTools,
  registerFeeTools,
  registerAnalyticsTools,
  registerAdditionalReportTools,
};
