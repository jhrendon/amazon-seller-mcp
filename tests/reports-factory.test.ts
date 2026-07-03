import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('../src/utils/report-poller.js', () => ({
  requestAndDownloadReport: vi.fn(),
}));

vi.mock('../src/config/index.js', () => ({
  getConfig: () => ({
    MARKETPLACE_ID: 'ATVPDKIKX0DER',
    SP_API_ENDPOINT: 'https://sellingpartnerapi-na.amazon.com',
  }),
  MARKETPLACE_IDS: { US: 'ATVPDKIKX0DER' },
  SP_API_ENDPOINTS: { NA: 'https://sellingpartnerapi-na.amazon.com' },
}));

import { requestAndDownloadReport } from '../src/utils/report-poller.js';
import { SPAPIError } from '../src/client/sp-api-client.js';
import { registerReportTool } from '../src/tools/reports/_factory.js';
import { setParticipatingMarketplaceIds } from '../src/tools/_shared/marketplace.js';



interface TestRecord {
  sku: string;
  asin: string;
  amount: string;
}

function makeServer() {
  const tools: Record<
    string,
    { handler: (input: unknown) => Promise<unknown>; schema: unknown }
  > = {};
  const server = {
    registerTool: (
      name: string,
      opts: { inputSchema: unknown },
      handler: (input: unknown) => Promise<unknown>
    ) => {
      tools[name] = { handler, schema: opts.inputSchema };
      return server;
    },
  };
  return { server, tools };
}

describe('report tool factory', () => {
  beforeEach(() => {
    vi.mocked(requestAndDownloadReport).mockReset();
    setParticipatingMarketplaceIds([]);
  });

  it('registers a tool and runs the full lifecycle', async () => {
    const csv = 'sku\tasin\tamount\nSKU-1\tB001\t10.00\nSKU-2\tB002\t20.00';
    vi.mocked(requestAndDownloadReport).mockResolvedValue({ data: csv, reportId: 'rpt-1' });

    const schema = z.object({
      startDate: z.string(),
      endDate: z.string(),
    });
    const { server, tools } = makeServer();

    registerReportTool<z.infer<typeof schema>, TestRecord>(server, 'test_report', {
      description: 'Test report',
      reportType: 'TEST_REPORT',
      inputSchema: schema,
      summary: (records) => ({
        count: records.length,
        total: records.reduce((sum, r) => sum + parseFloat(r.amount), 0),
      }),
    });

    const result = (await tools['test_report'].handler({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    })) as {
      structuredContent: { count: number; total: number };
    };

    expect(vi.mocked(requestAndDownloadReport)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestAndDownloadReport)).toHaveBeenCalledWith(
      'TEST_REPORT',
      expect.objectContaining({
        marketplaceIds: ['ATVPDKIKX0DER'],
        dataStartTime: '2024-01-01T00:00:00Z',
        dataEndTime: '2024-01-31T23:59:59Z',
      })
    );
    expect(result.structuredContent.count).toBe(2);
    expect(result.structuredContent.total).toBeCloseTo(30);
  });

  it('supports tools without a date range', async () => {
    const csv = 'sku\tasin\tamount\nSKU-1\tB001\t5.00';
    vi.mocked(requestAndDownloadReport).mockResolvedValue({ data: csv, reportId: 'rpt-2' });

    const schema = z.object({});
    const { server, tools } = makeServer();

    registerReportTool<z.infer<typeof schema>, TestRecord>(server, 'snapshot_report', {
      description: 'Snapshot report',
      reportType: 'SNAPSHOT_REPORT',
      inputSchema: schema,
      summary: (records) => ({ count: records.length }),
      requiresDateRange: false,
    });

    await tools['snapshot_report'].handler({});

    expect(vi.mocked(requestAndDownloadReport)).toHaveBeenCalledWith(
      'SNAPSHOT_REPORT',
      expect.objectContaining({
        marketplaceIds: ['ATVPDKIKX0DER'],
      })
    );
    expect(vi.mocked(requestAndDownloadReport)).toHaveBeenCalledWith(
      'SNAPSHOT_REPORT',
      expect.not.objectContaining({
        dataStartTime: expect.anything(),
        dataEndTime: expect.anything(),
      })
    );
  });

  it('passes dynamic report options through to the request', async () => {
    const csv = 'date\tsessions\n2024-01-01\t100';
    vi.mocked(requestAndDownloadReport).mockResolvedValue({ data: csv, reportId: 'rpt-3' });

    const schema = z.object({
      startDate: z.string(),
      endDate: z.string(),
      granularity: z.enum(['DAY', 'WEEK']).optional(),
    });
    const { server, tools } = makeServer();

    registerReportTool<z.infer<typeof schema>, Record<string, string>>(server, 'options_report', {
      description: 'Report with options',
      reportType: 'OPTIONS_REPORT',
      inputSchema: schema,
      summary: (records) => ({ rows: records.length }),
      reportOptions: (input) => ({ granularity: input.granularity || 'DAY' }),
    });

    await tools['options_report'].handler({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      granularity: 'WEEK',
    });

    expect(vi.mocked(requestAndDownloadReport)).toHaveBeenCalledWith(
      'OPTIONS_REPORT',
      expect.objectContaining({
        reportOptions: { granularity: 'WEEK' },
      })
    );
  });

  it('propagates an SPAPIError for CANCELLED reports', async () => {
    vi.mocked(requestAndDownloadReport).mockRejectedValue(
      new SPAPIError('Report was cancelled', undefined, 'CANCELLED', false, 'reportId: rpt-x')
    );

    const schema = z.object({ startDate: z.string(), endDate: z.string() });
    const { server, tools } = makeServer();

    registerReportTool<z.infer<typeof schema>, TestRecord>(server, 'failing_report', {
      description: 'Failing report',
      reportType: 'FAILING_REPORT',
      inputSchema: schema,
      summary: () => ({ success: true }),
    });

    await expect(
      tools['failing_report'].handler({ startDate: '2024-01-01', endDate: '2024-01-31' })
    ).rejects.toBeInstanceOf(SPAPIError);
  });

  it('translates a generic FATAL error into an SPAPIError', async () => {
    vi.mocked(requestAndDownloadReport).mockRejectedValue(new Error('Report failed with status: FATAL'));

    const schema = z.object({ startDate: z.string(), endDate: z.string() });
    const { server, tools } = makeServer();

    registerReportTool<z.infer<typeof schema>, TestRecord>(server, 'fatal_report', {
      description: 'Fatal report',
      reportType: 'FATAL_REPORT',
      inputSchema: schema,
      summary: () => ({ success: true }),
    });

    await expect(
      tools['fatal_report'].handler({ startDate: '2024-01-01', endDate: '2024-01-31' })
    ).rejects.toBeInstanceOf(SPAPIError);
  });

  it('respects custom poll and CSV options', async () => {
    const csv = 'sku,amount\nSKU-1,15.00';
    vi.mocked(requestAndDownloadReport).mockResolvedValue({ data: csv, reportId: 'rpt-4' });

    const schema = z.object({ startDate: z.string(), endDate: z.string() });
    const { server, tools } = makeServer();

    registerReportTool<z.infer<typeof schema>, TestRecord>(server, 'csv_report', {
      description: 'CSV report',
      reportType: 'CSV_REPORT',
      inputSchema: schema,
      summary: (records) => ({ count: records.length, firstAmount: records[0]?.amount }),
      pollOptions: { maxWaitMs: 60000, pollIntervalMs: 5000 },
      csvOptions: { delimiter: ',' },
    });

    const result = (await tools['csv_report'].handler({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    })) as {
      structuredContent: { count: number; firstAmount: string };
    };

    expect(vi.mocked(requestAndDownloadReport)).toHaveBeenCalledWith(
      'CSV_REPORT',
      expect.objectContaining({
        pollOptions: { maxWaitMs: 60000, pollIntervalMs: 5000 },
      })
    );
    expect(result.structuredContent.count).toBe(1);
    expect(result.structuredContent.firstAmount).toBe('15.00');
  });
});
