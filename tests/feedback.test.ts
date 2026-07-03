import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/sp-api-client.js')>();
  return {
    ...actual,
    getSPAPIClient: () => ({ get: getMock }),
  };
});

import { SPAPIError } from '../src/client/sp-api-client.js';
import { registerFeedbackTools } from '../src/tools/feedback.js';

function makeServer() {
  const tools: Record<string, { handler: (input: unknown) => Promise<unknown> }> = {};
  const server = {
    registerTool: (name: string, _opts: unknown, handler: (input: unknown) => Promise<unknown>) => {
      tools[name] = { handler };
      return server;
    },
  };
  return { server, tools };
}

describe('feedback tools', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('returns parsed insights for an ASIN', async () => {
    getMock.mockResolvedValue({
      insights: [
        {
          asin: 'B001',
          ratingDistribution: { totalCount: 100, averageRating: 4.2, fiveStar: 60, fourStar: 20 },
          positiveThemes: [{ name: 'easy to use', positiveCount: 30 }],
        },
      ],
    });
    const { server, tools } = makeServer();
    registerFeedbackTools(server);
    const handler = tools['get_feedback_insights_for_asin'].handler;
    const result = (await handler({ asin: 'B001' })) as { structuredContent: { insights: unknown[] } };
    expect(getMock).toHaveBeenCalledWith(
      '/customerFeedback/2024-06-01/items/B001/insights',
      expect.any(Object),
      expect.objectContaining({ rateLimitCategory: 'customerFeedback' })
    );
    expect(result.structuredContent.insights).toHaveLength(1);
  });

  it('surfaces 403 verbatim when Brand Registry is missing', async () => {
    const err = new SPAPIError('User not enrolled in Brand Registry', 403, 'FORBIDDEN', false, 'User not enrolled');
    getMock.mockRejectedValue(err);
    const { server, tools } = makeServer();
    registerFeedbackTools(server);
    const handler = tools['get_feedback_insights_for_asin'].handler;
    await expect(handler({ asin: 'B002' })).rejects.toThrow(/User not enrolled/);
  });

  it('returns an empty insights payload when the API returns nothing', async () => {
    getMock.mockResolvedValue({ insights: [] });
    const { server, tools } = makeServer();
    registerFeedbackTools(server);
    const handler = tools['get_feedback_insights_for_asin'].handler;
    const result = (await handler({ asin: 'B003' })) as { structuredContent: { insights: unknown[] } };
    expect(result.structuredContent.insights).toEqual([]);
  });

  it('returns insights for a browse node', async () => {
    getMock.mockResolvedValue({
      insights: [
        {
          browseNodeId: '123456',
          ratingDistribution: { totalCount: 500, averageRating: 4.0 },
          positiveThemes: [],
          negativeThemes: [],
        },
      ],
    });
    const { server, tools } = makeServer();
    registerFeedbackTools(server);
    const handler = tools['get_feedback_insights_for_browse_node'].handler;
    const result = (await handler({ browseNodeId: '123456' })) as { structuredContent: { insights: unknown[] } };
    expect(getMock).toHaveBeenCalledWith(
      '/customerFeedback/2024-06-01/browseNodes/123456/insights',
      expect.any(Object),
      expect.any(Object)
    );
    expect(result.structuredContent.insights).toHaveLength(1);
  });
});
