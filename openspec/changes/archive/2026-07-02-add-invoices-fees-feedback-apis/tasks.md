## 1. Types and contracts

- [x] 1.1 Add the Invoices API types to `src/types/sp-api.ts`: `Invoice`, `InvoiceLineItem`, `InvoiceStatus`, `InvoiceDocument`, `InvoicesResponse`
- [x] 1.2 Add the Product Fees types: `FeesEstimateRequest`, `FeesEstimateResponse`, `FeesEstimateResult`, `FeeDetail`, `Money`, `ShippingSpeed`
- [x] 1.3 Add the Customer Feedback types: `FeedbackInsight`, `RatingDistribution`, `Theme`, `FeedbackInsightsResponse`
- [x] 1.4 Verify all new types are exported from `src/types/sp-api.ts`

## 2. Rate limiter additions

- [x] 2.1 Add `invoices: { requestsPerSecond: 0.5, burstSize: 5 }` to `SP_API_RATE_LIMITS` in `src/client/rate-limiter.ts`
- [x] 2.2 Add `productFees: { requestsPerSecond: 0.5, burstSize: 5 }` to `SP_API_RATE_LIMITS`
- [x] 2.3 Add `customerFeedback: { requestsPerSecond: 1, burstSize: 5 }` to `SP_API_RATE_LIMITS`

## 3. Invoices tool

- [x] 3.1 Create `src/tools/invoices.ts` with the `registerInvoicesTools(server: McpServer): void` function exported
- [x] 3.2 Implement `get_invoices` with zod input `{ marketplaceId?: string, postedAfter: string (ISO 8601), postedBefore: string (ISO 8601), statuses?: InvoiceStatus[] (subset of Payable | PayableWithFC | Failed | Cancelled | Processing), pageSize?: number (default 25, max 100), nextToken?: string }`. Calls `GET /invoices/v0/invoices?marketplaceId=...`. Rate-limit category `invoices`. Returns invoices + optional `nextToken`.
- [x] 3.3 Implement `get_invoice_document` with zod input `{ invoiceId: string }`. Two-step: first `GET /invoices/v0/invoices/{invoiceId}/document` to retrieve the presigned URL, then fetch the PDF via a plain `axios.get(url, { responseType: 'stream' })`. Track bytes against the 1 MB threshold during the stream. If under threshold, return `{ url, downloaded: true, base64, sizeBytes }`; if over, abort and return `{ url, downloaded: false, sizeBytes: null }`.
- [x] 3.4 Implement `create_invoice` with strongly-typed zod input: `{ shipmentId: string, invoiceNumber: string, invoiceDate: string (ISO 8601), lineItems: z.array(z.object({ sku: z.string().optional(), asin: z.string().optional(), description: z.string(), quantity: z.number().int().positive(), unitPrice: z.object({ currencyCode: z.string().length(3), amount: z.string() }) })).min(1) }`. Calls `PUT /fba/inventory/v1/invoices` with the Amazon-formatted payload. Returns `{ invoiceId, invoiceNumber }`.
- [x] 3.5 Wire `registerInvoicesTools` into `src/tools/index.ts`

## 4. Live fees tool

- [x] 4.1 Create `src/tools/fees.ts` (top-level, NOT under `reports/`) with the `registerFeesTools(server: McpServer): void` function exported
- [x] 4.2 Implement `get_fees_estimate_for_asin` with zod input `{ asin?: string, asins?: string[] (max 20), price: z.object({ currencyCode: z.string().length(3), amount: z.string() }), marketplaceId?: string }` (exactly one of `asin` / `asins` is required). Loops internally over the `asins` array, awaiting each call, respecting the `productFees` rate-limiter. Returns an array of `FeesEstimateResult`.
- [x] 4.3 Implement `get_fees_estimate_for_sku` with zod input `{ sku: string, price: z.object({ currencyCode, amount }), shippingSpeed?: z.enum(['Standard', 'Expedited', 'Priority']) (default 'Standard'), marketplaceId?: string }`. Single call, returns the result.
- [x] 4.4 Wire `registerFeesTools` into `src/tools/index.ts`. Note: the existing `src/tools/reports/fees.ts` continues to expose the async report-based tools (`get_fba_fee_estimates`, `get_storage_fees`, `get_longterm_storage_fees`) and is NOT modified.

## 5. Customer feedback tool

- [x] 5.1 Create `src/tools/feedback.ts` with the `registerFeedbackTools(server: McpServer): void` function exported
- [x] 5.2 Implement `get_feedback_insights_for_asin` with zod input `{ asin: string, marketplaceId?: string }`. Calls `GET /customerFeedback/2024-06-01/items/{asin}/insights`. Rate-limit category `customerFeedback`. Surfaces 403 verbatim if Brand Registry is missing.
- [x] 5.3 Implement `get_feedback_insights_for_browse_node` with zod input `{ browseNodeId: string, marketplaceId?: string }`. Calls `GET /customerFeedback/2024-06-01/browseNodes/{browseNodeId}/insights`.
- [x] 5.4 Wire `registerFeedbackTools` into `src/tools/index.ts`

## 6. Tests

- [x] 6.1 Create `tests/invoices.test.ts` with mocked `getSPAPIClient` and a mocked stream for `get_invoice_document`. Test: get_invoices returns parsed invoices; get_invoice_document with a 500 KB stream returns `downloaded: true` and base64; get_invoice_document with a 2 MB stream returns `downloaded: false` and only the URL; create_invoice with missing `invoiceNumber` is rejected by zod; create_invoice with valid payload returns the new id and number.
- [x] 6.2 Create `tests/fees.test.ts`. Test: get_fees_estimate_for_asin with single ASIN, with 20 ASINs (loops and returns array), with 21 ASINs (rejected by zod); get_fees_estimate_for_sku defaults `shippingSpeed` to `Standard` and passes it through.
- [x] 6.3 Create `tests/feedback.test.ts`. Test: get_feedback_insights_for_asin returns parsed insights; 403 surfaces verbatim.
- [x] 6.4 Test the 1 MB PDF threshold logic in isolation (pure function over a buffer/stream).

## 7. Documentation

- [x] 7.1 Add a "Invoices" section to the README's "Available Tools" listing all 3 new tools
- [x] 7.2 Add a "Live Fees" section with the 2 new tools, noting that the report-based tools still exist in "Fee Reports" for batch historical analysis
- [x] 7.3 Add a "Customer Feedback" section with the 2 new tools and the Brand Registry note
- [x] 7.4 Add example queries for each new tool
- [x] 7.5 Update the architecture tree in the README to include the 3 new tool files
- [x] 7.6 Update the Features list to mention live fees, invoice generation, and customer feedback

## 8. Verification

- [x] 8.1 Run `pnpm run typecheck` — must pass
- [x] 8.2 Run `pnpm run lint` — must pass
- [x] 8.3 Run `pnpm test` — all new tests pass, existing tests still pass
- [x] 8.4 Run `pnpm run build` — produces updated `build/`
- [ ] 8.5 Manual smoke test: with valid credentials, `pnpm run dev` shows the existing `Validated seller ...` line (regression check)
- [ ] 8.6 Manual smoke test: invoke `get_fees_estimate_for_asin` with a known ASIN and a price → returns the estimate
- [ ] 8.7 Manual smoke test: invoke `get_feedback_insights_for_asin` for a Brand-Registered seller → returns insights (or 403 if not Brand-Registered)
