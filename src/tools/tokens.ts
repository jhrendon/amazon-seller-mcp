import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRestrictedDataToken } from '../auth/restricted-token.js';
import { makeToolResponse } from './_shared/response.js';

const createRestrictedDataTokenSchema = z.object({
  targetPath: z
    .string()
    .min(1)
    .describe('SP-API path the token is restricted to (e.g., /orders/v0/orders)'),
  dataElements: z
    .array(z.string().min(1))
    .min(1)
    .describe('Data elements to access (e.g., buyerInfo, shippingAddress)'),
  method: z
    .enum(['GET', 'POST', 'PUT', 'DELETE'])
    .optional()
    .default('GET')
    .describe('HTTP method for the restricted resource'),
  marketplaceId: z
    .string()
    .optional()
    .describe('Optional marketplace context (not sent to the Tokens API)'),
});

export function registerTokensTools(server: McpServer): void {
  server.registerTool(
    'create_restricted_data_token',
    {
      description:
        'Create a restricted data token (RDT) for accessing PII such as buyer info or shipping addresses on the target SP-API path.',
      inputSchema: createRestrictedDataTokenSchema,
    },
    async (input) => {
      const response = await createRestrictedDataToken([
        {
          method: input.method ?? 'GET',
          path: input.targetPath,
          dataElements: input.dataElements,
        },
      ]);

      return makeToolResponse(response);
    }
  );
}
