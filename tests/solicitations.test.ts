import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/sp-api-client.js')>();
  return {
    ...actual,
    getSPAPIClient: () => ({ get: getMock, post: postMock }),
  };
});

import { registerSolicitationsTools } from '../src/tools/solicitations.js';

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

describe('solicitations tools', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  describe('get_solicitation_actions_for_order', () => {
    it('returns parsed actions for an eligible order', async () => {
      getMock.mockResolvedValue({
        actions: [{ name: 'productReviewAndSellerFeedback', method: 'POST', href: '/solicitations/...' }],
      });
      const { server, tools } = makeServer();
      registerSolicitationsTools(server);
      const handler = tools['get_solicitation_actions_for_order'].handler;
      const result = (await handler({ orderId: '111-2222222-3333333' })) as {
        structuredContent: { actions: { name: string }[] };
      };
      expect(result.structuredContent.actions).toHaveLength(1);
      expect(result.structuredContent.actions[0].name).toBe('productReviewAndSellerFeedback');
      expect(getMock).toHaveBeenCalledWith(
        '/messaging/v1/orders/111-2222222-3333333/solicitation/actions',
        undefined,
        expect.objectContaining({ rateLimitCategory: 'solicitations' })
      );
    });

    it('rejects an order id that does not match the expected format', () => {
      const { server, tools } = makeServer();
      registerSolicitationsTools(server);
      const schema = tools['get_solicitation_actions_for_order'].schema as { parse: (v: unknown) => unknown };
      expect(() => schema.parse({ orderId: 'invalid' })).toThrow();
    });
  });

  describe('request_product_review', () => {
    it('refuses without calling Amazon when order is not Shipped', async () => {
      getMock.mockResolvedValue({ payload: { AmazonOrderId: '111-2222222-3333333', OrderStatus: 'Pending' } });
      const { server, tools } = makeServer();
      registerSolicitationsTools(server);
      const handler = tools['request_product_review'].handler;
      const result = (await handler({ orderId: '111-2222222-3333333' })) as {
        structuredContent: { sent: boolean; orderStatus: string; message: string };
      };
      expect(result.structuredContent.sent).toBe(false);
      expect(result.structuredContent.orderStatus).toBe('Pending');
      expect(result.structuredContent.message).toMatch(/can only request a review after shipment/i);
      expect(postMock).not.toHaveBeenCalled();
    });

    it('sends the POST when the order is Shipped', async () => {
      getMock.mockResolvedValue({ payload: { AmazonOrderId: '111-2222222-3333333', OrderStatus: 'Shipped' } });
      postMock.mockResolvedValue({});
      const { server, tools } = makeServer();
      registerSolicitationsTools(server);
      const handler = tools['request_product_review'].handler;
      const result = (await handler({ orderId: '111-2222222-3333333' })) as {
        structuredContent: { sent: boolean };
      };
      expect(result.structuredContent.sent).toBe(true);
      expect(postMock).toHaveBeenCalledWith(
        '/messaging/v1/orders/111-2222222-3333333/solicitations/productReviewAndSellerFeedback',
        {},
        expect.objectContaining({ rateLimitCategory: 'solicitations' })
      );
    });
  });
});
