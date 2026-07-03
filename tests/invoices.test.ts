import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const postMock = vi.fn();
const getMock = vi.fn();
const putMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({
    get: getMock,
    post: postMock,
    put: putMock,
  }),
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

import axios from 'axios';
import { fetchInvoiceDocument, registerInvoicesTools } from '../src/tools/invoices.js';

const mockedAxiosGet = axios.get as unknown as ReturnType<typeof vi.fn>;

function makeServer() {
  const tools: Record<string, { handler: (input: unknown) => Promise<unknown>; schema: unknown }> = {};
  const server = {
    registerTool: (name: string, opts: { inputSchema: unknown }, handler: (input: unknown) => Promise<unknown>) => {
      tools[name] = { handler, schema: opts.inputSchema };
      return server;
    },
  };
  return { server, tools };
}

function streamFromChunks(chunks: Buffer[]): Readable {
  return Readable.from(chunks);
}

describe('invoices tools', () => {
  beforeEach(() => {
    postMock.mockReset();
    getMock.mockReset();
    putMock.mockReset();
    mockedAxiosGet.mockReset();
  });

  describe('get_invoices', () => {
    it('returns parsed invoices with nextToken', async () => {
      const apiResponse = {
        invoices: [
          { id: 'inv-1', number: 'INV-001', issueDate: '2025-01-15', status: 'Payable', shipmentId: 'SHP-1' },
          { id: 'inv-2', number: 'INV-002', issueDate: '2025-01-16', status: 'Failed', shipmentId: 'SHP-2' },
        ],
        nextToken: 'tok-123',
      };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerInvoicesTools(server);
      const handler = tools['get_invoices'].handler;

      const result = (await handler({
        postedAfter: '2025-01-01T00:00:00Z',
        postedBefore: '2025-02-01T00:00:00Z',
      })) as { structuredContent: { invoices: unknown[]; nextToken: string } };

      expect(getMock).toHaveBeenCalledWith(
        '/invoices/v0/invoices',
        expect.objectContaining({ postedAfter: '2025-01-01T00:00:00Z', postedBefore: '2025-02-01T00:00:00Z' }),
        expect.objectContaining({ rateLimitCategory: 'invoices' })
      );
      expect(result.structuredContent.invoices).toHaveLength(2);
      expect(result.structuredContent.nextToken).toBe('tok-123');
    });
  });

  describe('get_invoice_document', () => {
    it('embeds the PDF as base64 when under 1 MB', async () => {
      getMock.mockResolvedValue({ url: 'https://example.com/inv.pdf' });
      const smallPdf = Buffer.alloc(500 * 1024, 0x41);
      mockedAxiosGet.mockResolvedValue({ data: streamFromChunks([smallPdf]), headers: {} });

      const result = await fetchInvoiceDocument('inv-1');
      expect(result.document.downloaded).toBe(true);
      expect(result.document.sizeBytes).toBe(500 * 1024);
      expect(result.document.base64).toBeDefined();
      expect(Buffer.from(result.document.base64!, 'base64').length).toBe(500 * 1024);
      expect(result.document.url).toBe('https://example.com/inv.pdf');
    });

    it('returns URL only when Content-Length is over 1 MB', async () => {
      getMock.mockResolvedValue({ url: 'https://example.com/big.pdf' });
      mockedAxiosGet.mockResolvedValue({
        data: streamFromChunks([]),
        headers: { 'content-length': String(2 * 1024 * 1024) },
      });

      const result = await fetchInvoiceDocument('inv-2');
      expect(result.document.downloaded).toBe(false);
      expect(result.document.sizeBytes).toBe(2 * 1024 * 1024);
      expect(result.document.base64).toBeUndefined();
    });

    it('returns URL only when streaming exceeds 1 MB', async () => {
      getMock.mockResolvedValue({ url: 'https://example.com/big.pdf' });
      mockedAxiosGet.mockResolvedValue({
        data: streamFromChunks([Buffer.alloc(800 * 1024), Buffer.alloc(400 * 1024)]),
        headers: {},
      });

      const result = await fetchInvoiceDocument('inv-3');
      expect(result.document.downloaded).toBe(false);
      expect(result.document.sizeBytes).toBeNull();
      expect(result.document.base64).toBeUndefined();
    });
  });

  describe('create_invoice', () => {
    it('rejects a payload missing invoiceNumber via zod', async () => {
      const { server, tools } = makeServer();
      registerInvoicesTools(server);
      const schema = tools['create_invoice'].schema as { parse: (v: unknown) => unknown };
      expect(() =>
        schema.parse({
          shipmentId: 'SHP-1',
          invoiceDate: '2025-01-15',
          lineItems: [{ description: 'Test', quantity: 1, unitPrice: { currencyCode: 'USD', amount: '10.00' } }],
        })
      ).toThrow();
    });

    it('rejects an empty lineItems array via zod', async () => {
      const { server, tools } = makeServer();
      registerInvoicesTools(server);
      const schema = tools['create_invoice'].schema as { parse: (v: unknown) => unknown };
      expect(() =>
        schema.parse({
          shipmentId: 'SHP-1',
          invoiceNumber: 'INV-001',
          invoiceDate: '2025-01-15',
          lineItems: [],
        })
      ).toThrow();
    });

    it('submits the invoice and returns the new id and number', async () => {
      putMock.mockResolvedValue({ invoiceId: 'inv-new', invoiceNumber: 'INV-100' });

      const { server, tools } = makeServer();
      registerInvoicesTools(server);
      const handler = tools['create_invoice'].handler;

      const result = (await handler({
        shipmentId: 'SHP-1',
        invoiceNumber: 'INV-100',
        invoiceDate: '2025-01-15',
        lineItems: [
          {
            sku: 'SKU-1',
            asin: 'B08N5WRWNW',
            description: 'Widget',
            quantity: 2,
            unitPrice: { currencyCode: 'USD', amount: '10.00' },
          },
        ],
      })) as { structuredContent: { invoiceId: string; invoiceNumber: string } };

      expect(putMock).toHaveBeenCalledWith(
        '/fba/inventory/v1/invoices',
        expect.objectContaining({
          shipmentId: 'SHP-1',
          invoiceNumber: 'INV-100',
          lineItems: expect.arrayContaining([
            expect.objectContaining({ unitPrice: { CurrencyCode: 'USD', Amount: '10.00' } }),
          ]),
        }),
        expect.objectContaining({ rateLimitCategory: 'invoices' })
      );
      expect(result.structuredContent).toEqual({ invoiceId: 'inv-new', invoiceNumber: 'INV-100' });
    });
  });
});
