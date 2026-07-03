import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { gzipSync } from 'zlib';
import { pollReportCompletion, downloadReportDocument } from '../src/utils/report-poller.js';

const getMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({ get: getMock }),
}));

describe('report-poller', () => {
  let axiosGetSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getMock.mockReset();
    axiosGetSpy = vi.spyOn(axios, 'get').mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('polls report status until DONE', async () => {
    getMock
      .mockResolvedValueOnce({ processingStatus: 'IN_QUEUE', reportId: 'rpt-1' })
      .mockResolvedValueOnce({ processingStatus: 'IN_PROGRESS', reportId: 'rpt-1' })
      .mockResolvedValueOnce({
        processingStatus: 'DONE',
        reportId: 'rpt-1',
        reportDocumentId: 'doc-1',
      });

    const result = await pollReportCompletion('rpt-1', { pollIntervalMs: 1, maxWaitMs: 100 });

    expect(getMock).toHaveBeenCalledWith(
      '/reports/2021-06-30/reports/rpt-1',
      undefined,
      expect.objectContaining({ rateLimitCategory: 'getReport' })
    );
    expect(getMock).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('DONE');
    expect(result.reportDocumentId).toBe('doc-1');
  });

  it('returns CANCELLED with an error when the report is cancelled', async () => {
    getMock.mockResolvedValue({ processingStatus: 'CANCELLED', reportId: 'rpt-2' });

    const result = await pollReportCompletion('rpt-2', { pollIntervalMs: 1, maxWaitMs: 50 });

    expect(result.status).toBe('CANCELLED');
    expect(result.error).toMatch(/cancelled/i);
  });

  it('downloads and decompresses a GZIP report document', async () => {
    const plainText = 'sku\tasin\nSKU-1\tB001';
    const gzipped = gzipSync(Buffer.from(plainText));

    getMock.mockResolvedValueOnce({
      reportDocumentId: 'doc-2',
      url: 'https://example.com/report.gz',
      compressionAlgorithm: 'GZIP' as const,
    });
    axiosGetSpy.mockResolvedValueOnce({ data: gzipped, headers: {} });

    const data = await downloadReportDocument('doc-2');

    expect(axiosGetSpy).toHaveBeenCalledWith('https://example.com/report.gz', {
      responseType: 'arraybuffer',
    });
    expect(data).toBe(plainText);
  });

  it('returns a plain document when no compression is indicated', async () => {
    const plainText = 'plain text report';

    getMock.mockResolvedValueOnce({
      reportDocumentId: 'doc-3',
      url: 'https://example.com/report.txt',
    });
    axiosGetSpy.mockResolvedValueOnce({ data: Buffer.from(plainText), headers: {} });

    const data = await downloadReportDocument('doc-3');

    expect(data).toBe(plainText);
  });
});
