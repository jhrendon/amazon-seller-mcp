import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({
    get: getMock,
    post: postMock,
  }),
}));

vi.mock('../src/utils/report-poller.js', () => ({
  downloadDocumentFromUrl: vi.fn(),
}));

import { registerDataKioskTools } from '../src/tools/data-kiosk.js';
import { downloadDocumentFromUrl } from '../src/utils/report-poller.js';

const downloadMock = vi.mocked(downloadDocumentFromUrl);

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

describe('data kiosk tools', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    downloadMock.mockReset();
  });

  describe('create_data_kiosk_query', () => {
    it('creates a query and returns the id', async () => {
      postMock.mockResolvedValue({ queryId: 'query-1' });

      const { server, tools } = makeServer();
      registerDataKioskTools(server);
      const handler = tools['create_data_kiosk_query'].handler;

      const result = (await handler({ query: '{ sales { date amount } }', pageSize: 100 })) as {
        structuredContent: { queryId: string };
      };

      expect(postMock).toHaveBeenCalledWith(
        '/dataKiosk/2023-11-15/queries',
        { query: '{ sales { date amount } }', pageSize: 100 },
        expect.objectContaining({ rateLimitCategory: 'dataKiosk' })
      );
      expect(result.structuredContent.queryId).toBe('query-1');
    });
  });

  describe('get_data_kiosk_query', () => {
    it('returns status without document when not done', async () => {
      const apiResponse = {
        queryId: 'query-1',
        query: '{ sales { date amount } }',
        createdTime: '2025-01-01T00:00:00Z',
        processingStatus: 'IN_PROGRESS',
      };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerDataKioskTools(server);
      const handler = tools['get_data_kiosk_query'].handler;

      const result = (await handler({ queryId: 'query-1' })) as { structuredContent: typeof apiResponse };

      expect(getMock).toHaveBeenCalledWith(
        '/dataKiosk/2023-11-15/queries/query-1',
        undefined,
        expect.objectContaining({ rateLimitCategory: 'dataKiosk' })
      );
      expect(downloadMock).not.toHaveBeenCalled();
      expect(result.structuredContent.processingStatus).toBe('IN_PROGRESS');
    });

    it('downloads and parses the document when done', async () => {
      const apiResponse = {
        queryId: 'query-1',
        query: '{ sales { date amount } }',
        createdTime: '2025-01-01T00:00:00Z',
        processingStatus: 'DONE',
        documentUrl: 'https://example.com/doc.json',
      };
      getMock.mockResolvedValue(apiResponse);
      downloadMock.mockResolvedValue('{"sales":[{"date":"2025-01-01","amount":100}]}');

      const { server, tools } = makeServer();
      registerDataKioskTools(server);
      const handler = tools['get_data_kiosk_query'].handler;

      const result = (await handler({ queryId: 'query-1' })) as {
        structuredContent: typeof apiResponse & { document: unknown };
      };

      expect(downloadMock).toHaveBeenCalledWith('https://example.com/doc.json');
      expect(result.structuredContent.processingStatus).toBe('DONE');
      expect(result.structuredContent.document).toEqual({
        sales: [{ date: '2025-01-01', amount: 100 }],
      });
    });

    it('returns raw string when document is not valid JSON', async () => {
      const apiResponse = {
        queryId: 'query-2',
        query: '{ sales { date amount } }',
        createdTime: '2025-01-01T00:00:00Z',
        processingStatus: 'DONE',
        documentUrl: 'https://example.com/doc.txt',
      };
      getMock.mockResolvedValue(apiResponse);
      downloadMock.mockResolvedValue('plain text content');

      const { server, tools } = makeServer();
      registerDataKioskTools(server);
      const handler = tools['get_data_kiosk_query'].handler;

      const result = (await handler({ queryId: 'query-2' })) as {
        structuredContent: typeof apiResponse & { document: unknown };
      };

      expect(result.structuredContent.document).toBe('plain text content');
    });
  });

  describe('list_data_kiosk_queries', () => {
    it('returns queries with pagination', async () => {
      const apiResponse = {
        queries: [
          { queryId: 'query-1', query: '{ sales { date amount } }', createdTime: '2025-01-01T00:00:00Z', processingStatus: 'DONE' },
        ],
        nextToken: 'tok-789',
      };
      getMock.mockResolvedValue(apiResponse);

      const { server, tools } = makeServer();
      registerDataKioskTools(server);
      const handler = tools['list_data_kiosk_queries'].handler;

      const result = (await handler({ processingStatuses: ['DONE'], nextToken: 'tok-prev' })) as {
        structuredContent: typeof apiResponse;
      };

      expect(getMock).toHaveBeenCalledWith(
        '/dataKiosk/2023-11-15/queries',
        expect.objectContaining({ processingStatuses: 'DONE', paginationToken: 'tok-prev' }),
        expect.objectContaining({ rateLimitCategory: 'dataKiosk' })
      );
      expect(result.structuredContent.queries).toHaveLength(1);
      expect(result.structuredContent.nextToken).toBe('tok-789');
    });
  });
});
