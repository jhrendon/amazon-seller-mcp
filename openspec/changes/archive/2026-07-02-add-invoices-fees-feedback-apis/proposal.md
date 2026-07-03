## Why

Three complementary write/read capabilities that round out the seller's day-to-day toolkit:
- **Invoices** — Amazon B2B and several EU jurisdictions require a generated invoice per shipment. Today the server can neither fetch existing invoices nor generate new ones.
- **Product Fees** — Sellers iterating on price points need to know FBA fees **now**, not from a 24-hour-old report. The `get_fba_fee_estimates` report exists but is async and slow.
- **Customer Feedback** — The Customer Feedback API gives item-level review insights (rating distribution, theme counts) per ASIN, complementing the existing Sales/Brand-Analytics reports with a granular view.

Together these are the next-highest-value APIs after Listings, Pricing, and Solicitations.

## What Changes

- Expose the **Invoices API** (v0) as 3 tools: `get_invoices` (list by date range and status), `get_invoice_document` (download a PDF invoice — returns the presigned URL always, and base64 only when size < 1 MB), and `create_invoice` (generate an invoice for a shipment with a strongly-typed zod payload). Required role: `Invoicing`.
- Expose the **Product Fees API** (v0) as 2 tools: `get_fees_estimate_for_asin` (single or batched up to 20 ASINs) and `get_fees_estimate_for_sku` (with `shippingSpeed: Standard | Expedited | Priority`, default `Standard`). Required role: `Product Fees`.
- Expose the **Customer Feedback API** as 2 tools: `get_feedback_insights_for_asin` and `get_feedback_insights_for_browse_node` (theme-level review analytics; requires Brand Registry). Required role: `Brand Analytics`.
- Add new rate-limit categories `invoices`, `productFees`, and `customerFeedback` to `src/client/rate-limiter.ts`.
- Add new response/request types to `src/types/sp-api.ts`.
- Three new tool files: `src/tools/invoices.ts`, `src/tools/fees.ts` (live API; the existing `src/tools/reports/fees.ts` continues to expose the report-based estimates as a complementary slow path), and `src/tools/feedback.ts`.

**No breaking changes.** New tools are additive. The existing `reports/fees.ts` report tools (`get_fba_fee_estimates`, `get_storage_fees`, `get_longterm_storage_fees`) keep working unchanged.

## Capabilities

### New Capabilities
- `invoice-generation`: List, fetch, and create shipment invoices via the Invoices API. `get_invoice_document` returns the presigned URL always and a base64 PDF only when the file is under 1 MB.
- `live-fee-estimation`: Compute FBA fee estimates in real time for an ASIN (single or batched) or a SKU (with shipping speed), complementing the async report-based estimation.
- `customer-feedback-insights`: Retrieve item-level and browse-node-level review insights (theme distribution, rating distribution) for Brand-Registered sellers.

### Modified Capabilities
- None.

## Impact

- **Code**: 3 new tool files (~500 lines), types additions (~200 lines), rate-limiter table (+3 categories).
- **Dependencies**: None new. `get_invoice_document`'s PDF download uses existing `axios` (no new HTTP client).
- **Rate limits**: New categories `invoices` (0.5 rps, burst 5), `productFees` (0.5 rps, burst 5), `customerFeedback` (1 rps, burst 5).
- **Permissions**: New roles `Invoicing`, `Product Fees`, `Brand Analytics`. Existing startup credential validation surfaces a 403 if any role is missing — no new validation needed.
- **Tests**: New `tests/invoices.test.ts`, `tests/fees.test.ts`, `tests/feedback.test.ts`. Special attention to `create_invoice` payload validation and the 1 MB PDF threshold logic in `get_invoice_document`.
- **Operational**: Invoices writes are permanent and can affect tax compliance. Tool descriptions and the README document this risk.
