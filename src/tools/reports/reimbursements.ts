import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReportTool } from './_factory.js';
import { REPORT_TYPES } from '../../types/sp-api.js';

// Input schema
const getReimbursementsSchema = z.object({
  startDate: z.string().describe('Start date in YYYY-MM-DD format'),
  endDate: z.string().describe('End date in YYYY-MM-DD format'),
});

type ReimbursementInput = z.infer<typeof getReimbursementsSchema>;

// Reimbursement record type
interface ReimbursementRecord {
  approval_date: string;
  reimbursement_id: string;
  case_id: string;
  amazon_order_id: string;
  reason: string;
  sku: string;
  fnsku: string;
  asin: string;
  product_name: string;
  condition: string;
  currency_unit: string;
  amount_per_unit: string;
  amount_total: string;
  quantity_reimbursed_cash: string;
  quantity_reimbursed_inventory: string;
  quantity_reimbursed_total: string;
  original_reimbursement_id: string;
  original_reimbursement_type: string;
}

function summarizeReimbursements(records: ReimbursementRecord[], input: ReimbursementInput) {
  const totalAmount = records.reduce(
    (sum, r) => sum + (parseFloat(r.amount_total) || 0),
    0
  );

  const byReason = records.reduce(
    (acc, r) => {
      const reason = r.reason || 'Unknown';
      if (!acc[reason]) {
        acc[reason] = { count: 0, amount: 0 };
      }
      acc[reason].count++;
      acc[reason].amount += parseFloat(r.amount_total) || 0;
      return acc;
    },
    {} as Record<string, { count: number; amount: number }>
  );

  const bySku = records.reduce(
    (acc, r) => {
      const sku = r.sku || 'Unknown';
      if (!acc[sku]) {
        acc[sku] = { count: 0, amount: 0, productName: r.product_name };
      }
      acc[sku].count++;
      acc[sku].amount += parseFloat(r.amount_total) || 0;
      return acc;
    },
    {} as Record<string, { count: number; amount: number; productName: string }>
  );

  const currency = records[0]?.currency_unit || 'USD';

  return {
    summary: {
      dateRange: { start: input.startDate, end: input.endDate },
      totalReimbursements: records.length,
      totalAmount: {
        amount: totalAmount.toFixed(2),
        currencyCode: currency,
      },
    },
    byReason: Object.entries(byReason)
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        amount: data.amount.toFixed(2),
      }))
      .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)),
    bySku: Object.entries(bySku)
      .map(([sku, data]) => ({
        sku,
        productName: data.productName,
        count: data.count,
        amount: data.amount.toFixed(2),
      }))
      .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
      .slice(0, 20), // Top 20 SKUs
    recentReimbursements: records.slice(0, 50).map((r) => ({
      reimbursementId: r.reimbursement_id,
      approvalDate: r.approval_date,
      reason: r.reason,
      sku: r.sku,
      asin: r.asin,
      productName: r.product_name,
      quantity: r.quantity_reimbursed_total,
      amount: r.amount_total,
      amazonOrderId: r.amazon_order_id,
      caseId: r.case_id,
    })),
  };
}

export function registerReimbursementTools(server: McpServer): void {
  registerReportTool<ReimbursementInput, ReimbursementRecord>(
    server,
    'get_fba_reimbursements',
    {
      description:
        'Get FBA reimbursements for lost, damaged, or returned inventory within a date range. Shows reimbursement amounts, reasons, and affected products. Useful for tracking Amazon credits for inventory issues.',
      reportType: REPORT_TYPES.FBA_REIMBURSEMENTS,
      inputSchema: getReimbursementsSchema,
      summary: summarizeReimbursements,
      pollOptions: {
        maxWaitMs: 300000,
        pollIntervalMs: 15000,
      },
      csvOptions: { delimiter: '\t' },
    }
  );
}
