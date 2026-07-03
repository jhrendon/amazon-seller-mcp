import { describe, it, expect, vi, beforeEach } from 'vitest';

const postMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({
    post: postMock,
  }),
}));

import { registerTokensTools } from '../src/tools/tokens.js';

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

describe('tokens tools', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  describe('create_restricted_data_token', () => {
    it('creates a token with default GET method', async () => {
      postMock.mockResolvedValue({ restrictedDataToken: 'rdt-123', expiresIn: 3600 });

      const { server, tools } = makeServer();
      registerTokensTools(server);
      const handler = tools['create_restricted_data_token'].handler;

      const result = (await handler({
        targetPath: '/orders/v0/orders',
        dataElements: ['buyerInfo', 'shippingAddress'],
      })) as { structuredContent: { restrictedDataToken: string; expiresIn: number } };

      expect(postMock).toHaveBeenCalledWith(
        '/tokens/2021-03-01/restrictedDataToken',
        {
          restrictedResources: [
            { method: 'GET', path: '/orders/v0/orders', dataElements: ['buyerInfo', 'shippingAddress'] },
          ],
        },
        expect.objectContaining({ rateLimitCategory: 'tokens' })
      );
      expect(result.structuredContent.restrictedDataToken).toBe('rdt-123');
    });

    it('accepts explicit method override', async () => {
      postMock.mockResolvedValue({ restrictedDataToken: 'rdt-post' });

      const { server, tools } = makeServer();
      registerTokensTools(server);
      const handler = tools['create_restricted_data_token'].handler;

      await handler({
        targetPath: '/orders/v0/orders',
        dataElements: ['buyerInfo'],
        method: 'POST',
      });

      expect(postMock).toHaveBeenCalledWith(
        '/tokens/2021-03-01/restrictedDataToken',
        expect.objectContaining({
          restrictedResources: [expect.objectContaining({ method: 'POST' })],
        }),
        expect.any(Object)
      );
    });

    it('rejects empty dataElements via zod', () => {
      const { server, tools } = makeServer();
      registerTokensTools(server);
      const schema = tools['create_restricted_data_token'].schema as { parse: (v: unknown) => unknown };
      expect(() => schema.parse({ targetPath: '/orders/v0/orders', dataElements: [] })).toThrow();
    });
  });
});
