import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requestAndDownloadReport, type PollOptions } from '../../utils/report-poller.js';
import { parseCSV, type CSVParseOptions } from '../../utils/csv-parser.js';
import { makeToolResponse } from '../_shared/response.js';
import { resolveMarketplaceId, validateMarketplaceId } from '../_shared/marketplace.js';
import { SPAPIError } from '../../client/sp-api-client.js';

export interface ReportToolOptions<TInput extends Record<string, unknown>, TRecord> {
  description: string;
  reportType: string;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  summary: (records: TRecord[], input: TInput) => unknown;
  pollOptions?: PollOptions;
  csvOptions?: CSVParseOptions;
  reportOptions?: Record<string, string> | ((input: TInput) => Record<string, string>);
  requiresDateRange?: boolean;
}

export function registerReportTool<TInput extends Record<string, unknown>, TRecord>(
  server: McpServer,
  name: string,
  options: ReportToolOptions<TInput, TRecord>
): void {
  server.registerTool(
    name,
    {
      description: options.description,
      inputSchema: options.inputSchema,
    },
    async (input) => {
      const marketplaceId = resolveMarketplaceId(
        (input as { marketplaceId?: string }).marketplaceId
      );
      validateMarketplaceId(marketplaceId);

      const requestOptions: {
        marketplaceIds: string[];
        dataStartTime?: string;
        dataEndTime?: string;
        reportOptions?: Record<string, string>;
        pollOptions?: PollOptions;
      } = {
        marketplaceIds: [marketplaceId],
        pollOptions: options.pollOptions,
      };

      if (options.requiresDateRange !== false) {
        const typedInput = input as unknown as { startDate: string; endDate: string };
        requestOptions.dataStartTime = `${typedInput.startDate}T00:00:00Z`;
        requestOptions.dataEndTime = `${typedInput.endDate}T23:59:59Z`;
      }

      if (options.reportOptions) {
        requestOptions.reportOptions =
          typeof options.reportOptions === 'function'
            ? options.reportOptions(input as TInput)
            : options.reportOptions;
      }

      try {
        const { data } = await requestAndDownloadReport(options.reportType, requestOptions);
        const records = parseCSV<TRecord>(data, options.csvOptions ?? { delimiter: '\t' });
        const result = options.summary(records, input as TInput);
        return makeToolResponse(result);
      } catch (error) {
        if (error instanceof SPAPIError) {
          throw error;
        }

        if (error instanceof Error) {
          const statusMatch = error.message.match(/status:\s*(CANCELLED|FATAL)/i);
          if (statusMatch) {
            const status = statusMatch[1].toUpperCase();
            throw new SPAPIError(
              `Report processing failed with status ${status}: ${error.message}`,
              undefined,
              status,
              false,
              error.message
            );
          }
          throw new SPAPIError(error.message);
        }

        throw error;
      }
    }
  );
}
