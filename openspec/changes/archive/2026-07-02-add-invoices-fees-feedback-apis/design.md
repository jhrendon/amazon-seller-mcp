## Context

This change continues the read-only → read-write arc begun by phase 1. Three APIs are added: Invoices (legal/tax requirement in EU and for B2B), Product Fees (live alternative to the async `get_fba_fee_estimates` report), and Customer Feedback (granular review insights for Brand-Registered sellers). All three are complementary to existing tools and do not overlap with phase 1.

The Invoices API (v0) is distinct from the `Shipment Invoicing API` — Invoices is the modern, cleaner surface. Product Fees returns a `FeesEstimate` with a `TotalFeesEstimate` and a `FeeDetail[]` breakdown. Customer Feedback requires Brand Registry; non-brand sellers get a 403.

Three new rate-limit categories need to be added to `src/client/rate-limiter.ts:73-98`: `invoices`, `productFees`, `customerFeedback`. They are separate from the existing `fees` and `finances` categories because they target different endpoints with different quota buckets.

## Goals / Non-Goals

**Goals:**
- Live, in-request FBA fee estimation.
- Shipment invoice list + create + document fetch.
- Item-level and browse-node-level review insights.
- Strongly-typed payloads for write operations to fail fast on bad input.
- Threshold-based PDF embedding to avoid bloating the response for large invoices.

**Non-Goals:**
- VAT Calculation Service (different surface with its own auth model; deferred).
- Shipment Invoicing API (older surface, overlaps with Invoices; deferred).
- PDF upload-from-base64 flow (requires Uploads API; deferred to phase 4).
- Brand Analytics reports via the Reports API (already covered by `get_search_terms_report`).
- Review sentiment beyond what the Customer Feedback API provides (no other surface exposes this).

## Decisions

### Decision 1: `create_invoice` accepts a strongly-typed zod payload
**Why:** Amazon's invoice format is strict (required envelope fields, line-item structure, currency alignment). Letting Claude send arbitrary JSON pushes all validation to Amazon. A typed zod schema — `shipmentId`, `invoiceNumber`, `invoiceDate`, `lineItems: [{ sku?, asin?, description, quantity, unitPrice, ... }]` — catches the common failures (missing required fields, wrong types) before the request leaves the server.

**Why no `buyerNotes` / `giftMessage` in this change:** the Amazon schema supports them, but they add 2 more optional fields and a string-length validation. Keeping the tool minimal in v1. Can be added in a follow-up without breaking the shape.

### Decision 2: `get_invoice_document` returns URL always, base64 only when file < 1 MB
**Why:** Amazon returns a presigned URL valid for a few minutes. Claude can either show the URL to the user (most common) or attach the PDF to the conversation (rare, useful for tax filing). The 1 MB threshold is a balance: small invoices (single-page PDFs) embed; large multi-page invoices with line items stay as URLs to keep the JSON response manageable. The `downloaded: boolean` field in the response tells the caller which path was taken.

**Why 1 MB and not, say, 5 MB:** base64 inflates by ~33%. A 5 MB PDF becomes a ~6.7 MB JSON blob, which is awkward to stream through the MCP transport. 1 MB keeps the response under ~1.4 MB and covers the common case of a single-page invoice.

### Decision 3: Product Fees "batch" exposed as a single tool with optional array
**Why:** Amazon's batch endpoint (`getMyFeesEstimateForASINList`) is functionally a loop over the single endpoint with a 20-item cap. Exposing `get_fees_estimate_for_asin` with `asin?: string` OR `asins?: string[]` (mutually exclusive, max 20) lets the tool serve both the single and batched cases without forcing the user to choose. Internally the tool loops, respecting rate limits via the `productFees` rate-limiter category.

### Decision 4: `get_fees_estimate_for_sku` accepts `shippingSpeed` defaulting to `Standard`
**Why:** FBA fees depend on shipping speed. `Standard`, `Expedited`, and `Priority` produce materially different numbers. Defaulting to `Standard` matches the most common seller scenario; exposing the others is one zod enum field with no real cost.

### Decision 5: Customer Feedback soft-guarded via tool description, not client-side check
**Why:** The tool description documents the Brand Registry requirement. There is no clean client-side check for Brand Registry — the seller either gets 200 with insights or 403. The 403 message from Amazon is opaque, but a Claude prompt with the requirement upfront is enough. Adding a `get_account` call first would add a round-trip and surface its own permission surface.

### Decision 6: Currency comes from the response, not the request
**Why:** Neither Invoices nor Product Fees take a `currency` arg. The currency is determined by the marketplace and reflected in the response. The tool surfaces it in the structured response so the caller knows.

## Risks / Trade-offs

- **[Risk] `create_invoice` payloads are complex and Amazon's validation is strict.** → **Mitigation**: strong zod schema with all required fields; surface Amazon's `errors[].details` verbatim. The tool description includes an example payload.
- **[Risk] Invoices PDF download can be large; base64-encoding inflates the response by ~33%.** → **Mitigation**: 1 MB threshold (Decision 2). When over threshold, the `downloaded: false` response makes it explicit that the caller should use the URL.
- **[Risk] Customer Feedback is Brand-Registry only; 403 message is opaque.** → **Mitigation**: tool description explicitly states the requirement; README explains how to check Brand Registry status in Seller Central.
- **[Risk] `create_invoice` once submitted is permanent and may have tax implications.** → **Mitigation**: tool description includes a "this is permanent" warning; the README documents the safe `get_invoices` → `create_invoice` flow with a recommendation to confirm invoice numbers are unique.
- **[Trade-off] We do not deduplicate `get_fees_estimate_for_asin` calls across requests.** A repricer calling the tool every 30s for 20 ASINs burns 40 rps — within the 0.5 rps default category it would be throttled. Acceptable; the seller can lower the polling rate.

## Migration Plan

Additive change, no migrations. Deploy steps:
1. `pnpm install` (no new deps).
2. `pnpm run typecheck && pnpm run lint && pnpm test` — all green.
3. `pnpm run build`.
4. Existing deployments restart transparently and gain 7 new tools.
5. Document the new tools in the README.

**Rollback:** revert commit. No state changes; new tools are not registered, so no side effects.

## Open Questions

All open questions from the planning conversation are resolved:
- D. PDF return strategy → **URL always, base64 only if <1 MB** (Decision 2).
- E. `create_invoice` extra fields → **no buyerNotes/giftMessage in v1** (Decision 1).
- F. `shippingSpeed` on SKU fees → **yes, default Standard** (Decision 4).
