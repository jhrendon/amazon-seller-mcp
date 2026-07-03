import { Readable } from 'node:stream';
import { z } from 'zod';
import axios from 'axios';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { getConfig } from '../config/index.js';
import { marketplaceIdSchema } from './_shared/schemas.js';
import { resolveMarketplaceId, validateMarketplaceId } from './_shared/marketplace.js';
import { makeToolResponse } from './_shared/response.js';
import type { InvoicesResponse, InvoiceDocument, InvoiceStatus } from '../types/sp-api.js';

const INVOICE_PDF_EMBED_THRESHOLD_BYTES = 1024 * 1024;

const invoiceStatusValues = [
  'Payable',
  'PayableWithFC',
  'Failed',
  'Cancelled',
  'Processing',
] as const satisfies readonly InvoiceStatus[];

const getInvoicesSchema = z.object({
  marketplaceId: marketplaceIdSchema.optional().describe('Amazon marketplace ID (defaults to MARKETPLACE_ID env var)'),
  postedAfter: z.string().describe('ISO 8601 date. Invoices posted after this date (e.g., 2025-01-01T00:00:00Z)'),
  postedBefore: z.string().optional().describe('ISO 8601 date. Invoices posted before this date'),
  statuses: z
    .array(z.enum(invoiceStatusValues))
    .optional()
    .describe('Filter by invoice status'),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe('Maximum number of results per page (default 25, max 100)'),
  nextToken: z.string().optional().describe('Pagination token for next page of results'),
});

const getInvoiceDocumentSchema = z.object({
  invoiceId: z.string().min(1).describe('The invoice ID returned by get_invoices'),
});

const invoiceLineItemSchema = z.object({
  sku: z.string().optional(),
  asin: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.object({
    currencyCode: z.string().length(3),
    amount: z.string().min(1),
  }),
});

const createInvoiceSchema = z.object({
  shipmentId: z.string().min(1).describe('The shipment ID to invoice'),
  invoiceNumber: z.string().min(1).describe('Unique invoice number (must be unique per shipment)'),
  invoiceDate: z.string().describe('ISO 8601 date. The date the invoice is issued'),
  lineItems: z.array(invoiceLineItemSchema).min(1).describe('At least one line item'),
  marketplaceId: marketplaceIdSchema.optional().describe('Marketplace ID (defaults to MARKETPLACE_ID env var)'),
});

export interface InvoiceDocumentResult {
  invoiceId: string;
  document: {
    url: string;
    downloaded: boolean;
    base64?: string;
    sizeBytes: number | null;
  };
}

export async function fetchInvoiceDocument(
  invoiceId: string,
  thresholdBytes: number = INVOICE_PDF_EMBED_THRESHOLD_BYTES
): Promise<InvoiceDocumentResult> {
  const client = getSPAPIClient();
  const { url } = await client.get<InvoiceDocument>(
    `/invoices/v0/invoices/${encodeURIComponent(invoiceId)}/document`,
    undefined,
    { rateLimitCategory: 'invoices' }
  );

  const response = await axios.get<Readable>(url, { responseType: 'stream' });
  const stream = response.data;
  const contentLength = Number(response.headers['content-length'] ?? 0);

  if (contentLength > 0 && contentLength > thresholdBytes) {
    stream.destroy();
    return { invoiceId, document: { url, downloaded: false, sizeBytes: contentLength } };
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let exceeded = false;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > thresholdBytes) {
      exceeded = true;
      break;
    }
    chunks.push(buf);
  }

  if (exceeded) {
    stream.destroy();
    return { invoiceId, document: { url, downloaded: false, sizeBytes: null } };
  }

  const full = Buffer.concat(chunks);
  return {
    invoiceId,
    document: {
      url,
      downloaded: true,
      base64: full.toString('base64'),
      sizeBytes: totalBytes,
    },
  };
}

export function registerInvoicesTools(server: McpServer): void {
  server.registerTool(
    'get_invoices',
    {
      description:
        'List shipment invoices in a date range from Amazon Seller Central, optionally filtered by status. Returns invoice metadata (id, number, issueDate, totalAmount, currency, status, shipmentId).',
      inputSchema: getInvoicesSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const queryParams: Record<string, unknown> = {
        marketplaceId,
        postedAfter: input.postedAfter,
        pageSize: input.pageSize,
      };
      if (input.postedBefore) queryParams.postedBefore = input.postedBefore;
      if (input.statuses && input.statuses.length > 0) {
        queryParams.statuses = input.statuses.join(',');
      }
      if (input.nextToken) queryParams.nextToken = input.nextToken;

      const response = await client.get<InvoicesResponse>('/invoices/v0/invoices', queryParams, {
        rateLimitCategory: 'invoices',
      });

      const payload = {
        invoices: response.invoices ?? [],
        nextToken: response.nextToken,
      };

      return makeToolResponse(payload);
    }
  );

  server.registerTool(
    'get_invoice_document',
    {
      description:
        'Download a shipment invoice PDF. If the PDF is under 1 MB it is embedded as base64 in the response. If it is 1 MB or larger the response contains only the presigned URL. Use the `downloaded` flag to know which case applies.',
      inputSchema: getInvoiceDocumentSchema,
    },
    async (input) => {
      const result = await fetchInvoiceDocument(input.invoiceId);
      return makeToolResponse(result);
    }
  );

  server.registerTool(
    'create_invoice',
    {
      description:
        'Generate a shipment invoice for an Amazon FBA shipment. Returns the new invoice id and number. Note: invoices are permanent and may have tax implications. Validate the shipment, the uniqueness of the invoiceNumber, and the line items before submitting.',
      inputSchema: createInvoiceSchema,
    },
    async (input) => {
      const client = getSPAPIClient();
      const config = getConfig();
      const marketplaceId = resolveMarketplaceId(input.marketplaceId);
      validateMarketplaceId(marketplaceId);

      const body = {
        shipmentId: input.shipmentId,
        invoiceDate: input.invoiceDate,
        invoiceNumber: input.invoiceNumber,
        sellerId: config.SELLER_ID,
        lineItems: input.lineItems.map((li) => ({
          sku: li.sku,
          asin: li.asin,
          description: li.description,
          quantity: li.quantity,
          unitPrice: { CurrencyCode: li.unitPrice.currencyCode, Amount: li.unitPrice.amount },
        })),
      };

      const result = await client.put<{ invoiceId: string; invoiceNumber: string }>(
        '/fba/inventory/v1/invoices',
        body,
        { rateLimitCategory: 'invoices' }
      );

      return makeToolResponse(result);
    }
  );
}
