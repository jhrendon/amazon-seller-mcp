import { z } from 'zod';
import type { Money } from '../../types/sp-api.js';

export const moneySchema = z.object({
  currencyCode: z.string().length(3).describe('ISO 4217 currency code (e.g., USD, EUR)'),
  amount: z.string().min(1).describe('Decimal amount as a string (e.g., "24.99")'),
});

export function toMoney(input: { currencyCode: string; amount: string }): Money {
  return { CurrencyCode: input.currencyCode, Amount: input.amount };
}

export const orderIdSchema = z
  .string()
  .regex(/^\d{3}-\d{7}-\d{7}$/, 'Invalid Amazon order ID format (expected: 111-1234567-1234567)')
  .describe('The Amazon order ID (e.g., 111-1234567-1234567)');

export const marketplaceIdSchema = z.string().min(1).describe('Amazon marketplace ID');

export const dateRangeSchema = z.object({
  startDate: z.string().describe('Start date in YYYY-MM-DD format'),
  endDate: z.string().describe('End date in YYYY-MM-DD format'),
});
