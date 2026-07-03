import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSPAPIClient } from '../client/sp-api-client.js';
import { makeToolResponse } from './_shared/response.js';
import { downloadDocumentFromUrl } from '../utils/report-poller.js';
import type {
  CreateDataKioskQueryResponse,
  GetDataKioskQueryResponse,
  ListDataKioskQueriesResponse,
} from '../types/sp-api.js';

const createDataKioskQuerySchema = z.object({
  query: z.string().min(1).describe('GraphQL query document'),
  pageSize: z.number().int().positive().optional().describe('Maximum results per page'),
});

const getDataKioskQuerySchema = z.object({
  queryId: z.string().min(1).describe('Data Kiosk query ID'),
});

const listDataKioskQueriesSchema = z.object({
  pageSize: z.number().int().positive().optional().describe('Maximum results per page'),
  paginationToken: z.string().optional().describe('Pagination token'),
  nextToken: z.string().optional().describe('Alias for paginationToken'),
  processingStatuses: z
    .array(z.string())
    .optional()
    .describe('Filter by processing statuses'),
});

function parseDocumentContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

export function registerDataKioskTools(server: McpServer): void {
  server.registerTool(
    'create_data_kiosk_query',
    {
      description: 'Create a Data Kiosk query from a GraphQL query document.',
      inputSchema: createDataKioskQuerySchema,
    },
    async (input) => {
      const client = getSPAPIClient();

      const body: Record<string, unknown> = { query: input.query };
      if (input.pageSize) body.pageSize = input.pageSize;

      const response = await client.post<CreateDataKioskQueryResponse>(
        '/dataKiosk/2023-11-15/queries',
        body,
        { rateLimitCategory: 'dataKiosk' }
      );

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'get_data_kiosk_query',
    {
      description:
        'Get the status of a Data Kiosk query. When the query is DONE, the document is downloaded and parsed.',
      inputSchema: getDataKioskQuerySchema,
    },
    async (input) => {
      const client = getSPAPIClient();

      const response = await client.get<GetDataKioskQueryResponse>(
        `/dataKiosk/2023-11-15/queries/${encodeURIComponent(input.queryId)}`,
        undefined,
        { rateLimitCategory: 'dataKiosk' }
      );

      if (response.processingStatus === 'DONE' && response.documentUrl) {
        const content = await downloadDocumentFromUrl(response.documentUrl);
        return makeToolResponse({
          ...response,
          document: parseDocumentContent(content),
        });
      }

      return makeToolResponse(response);
    }
  );

  server.registerTool(
    'list_data_kiosk_queries',
    {
      description: 'List Data Kiosk queries with pagination support.',
      inputSchema: listDataKioskQueriesSchema,
    },
    async (input) => {
      const client = getSPAPIClient();

      const params: Record<string, unknown> = {};
      if (input.pageSize) params.pageSize = input.pageSize;
      if (input.paginationToken) params.paginationToken = input.paginationToken;
      if (input.nextToken) params.paginationToken = input.nextToken;
      if (input.processingStatuses) params.processingStatuses = input.processingStatuses.join(',');

      const response = await client.get<ListDataKioskQueriesResponse>(
        '/dataKiosk/2023-11-15/queries',
        Object.keys(params).length > 0 ? params : undefined,
        { rateLimitCategory: 'dataKiosk' }
      );

      return makeToolResponse(response);
    }
  );
}
