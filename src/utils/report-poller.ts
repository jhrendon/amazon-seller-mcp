import axios from 'axios';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { getSPAPIClient, SPAPIError } from '../client/sp-api-client.js';
import type { GetReportResponse, GetReportDocumentResponse, ReportProcessingStatus } from '../types/sp-api.js';

export interface PollOptions {
  maxWaitMs?: number;
  pollIntervalMs?: number;
  onStatusChange?: (status: ReportProcessingStatus) => void;
}

export interface ReportResult {
  status: ReportProcessingStatus;
  reportId: string;
  reportDocumentId?: string;
  error?: string;
}

/**
 * Poll for report completion
 * Returns when report is DONE, CANCELLED, or FATAL, or when timeout is reached
 */
export async function pollReportCompletion(
  reportId: string,
  options: PollOptions = {}
): Promise<ReportResult> {
  const { maxWaitMs = 300000, pollIntervalMs = 30000, onStatusChange } = options;

  const client = getSPAPIClient();
  const startTime = Date.now();
  let lastStatus: ReportProcessingStatus | null = null;

  while (Date.now() - startTime < maxWaitMs) {
    const report = await client.get<GetReportResponse>(`/reports/2021-06-30/reports/${reportId}`, undefined, {
      rateLimitCategory: 'getReport',
    });

    const currentStatus = report.processingStatus;

    // Notify of status change
    if (currentStatus !== lastStatus) {
      lastStatus = currentStatus;
      onStatusChange?.(currentStatus);
    }

    // Check terminal states
    if (currentStatus === 'DONE') {
      return {
        status: 'DONE',
        reportId,
        reportDocumentId: report.reportDocumentId,
      };
    }

    if (currentStatus === 'CANCELLED') {
      return {
        status: 'CANCELLED',
        reportId,
        error: 'Report was cancelled',
      };
    }

    if (currentStatus === 'FATAL') {
      return {
        status: 'FATAL',
        reportId,
        error: 'Report processing failed',
      };
    }

    // Still processing, wait and retry
    await sleep(pollIntervalMs);
  }

  // Timeout
  return {
    status: lastStatus || 'IN_QUEUE',
    reportId,
    error: `Timeout waiting for report completion (waited ${maxWaitMs}ms)`,
  };
}

/**
 * Download and decompress report document
 */
export async function downloadReportDocument(reportDocumentId: string): Promise<string> {
  const client = getSPAPIClient();

  // Get the pre-signed URL
  const docInfo = await client.get<GetReportDocumentResponse>(
    `/reports/2021-06-30/documents/${reportDocumentId}`,
    undefined,
    { rateLimitCategory: 'getReportDocument' }
  );

  return downloadDocumentFromUrl(docInfo.url, docInfo.compressionAlgorithm);
}

/**
 * Download and decompress a document from a pre-signed URL.
 * When the compression algorithm is unknown, the helper inspects the
 * Content-Encoding response header and gzip magic bytes as a fallback.
 */
export async function downloadDocumentFromUrl(
  url: string,
  compressionAlgorithm?: 'GZIP'
): Promise<string> {
  // Download the document
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
  });

  const data = Buffer.from(response.data);
  const contentEncoding =
    response.headers['content-encoding']?.toString().toLowerCase() || '';

  // Decompress if necessary
  if (
    compressionAlgorithm === 'GZIP' ||
    contentEncoding === 'gzip' ||
    isGzipBuffer(data)
  ) {
    return decompressGzip(data);
  }

  return data.toString('utf-8');
}

function isGzipBuffer(data: Buffer): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

/**
 * Decompress GZIP data
 */
async function decompressGzip(data: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];

    const stream = Readable.from(data);
    stream
      .pipe(gunzip)
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      .on('error', reject);
  });
}

/**
 * Request a report and wait for completion
 * Convenience function that combines createReport + pollReportCompletion + downloadReportDocument
 */
export async function requestAndDownloadReport(
  reportType: string,
  options: {
    dataStartTime?: string;
    dataEndTime?: string;
    marketplaceIds?: string[];
    reportOptions?: Record<string, string>;
    pollOptions?: PollOptions;
  } = {}
): Promise<{ data: string; reportId: string }> {
  const client = getSPAPIClient();

  // Create the report request
  const createResponse = await client.post<{ reportId: string }>(
    '/reports/2021-06-30/reports',
    {
      reportType,
      ...(options.dataStartTime && { dataStartTime: options.dataStartTime }),
      ...(options.dataEndTime && { dataEndTime: options.dataEndTime }),
      ...(options.marketplaceIds && { marketplaceIds: options.marketplaceIds }),
      ...(options.reportOptions && { reportOptions: options.reportOptions }),
    },
    { rateLimitCategory: 'createReport' }
  );

  const reportId = createResponse.reportId;

  // Poll for completion
  const result = await pollReportCompletion(reportId, options.pollOptions);

  if (result.status !== 'DONE' || !result.reportDocumentId) {
    const message = result.error || `Report failed with status: ${result.status}`;
    throw new SPAPIError(
      message,
      undefined,
      result.status,
      false,
      `reportId: ${reportId}`
    );
  }

  // Download the document
  const data = await downloadReportDocument(result.reportDocumentId);

  return { data, reportId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
