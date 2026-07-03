## Context

The server is currently read-only: `get_orders`, `get_inventory_summary`, `get_catalog_item`, `get_financial_events`, and a dozen other tools all query data. There is no way to mutate state in Seller Central. The Listings Items API v2021-08-01 is Amazon's canonical write surface for product listings (replacing the legacy XML-based Feeds approach for new use cases). The Pricing v2022-05-01 batch endpoints are Amazon's preferred way to query competitive pricing and the Featured Offer Expected Price (FOEP), which are the inputs a repricer needs. The Solicitations v1 API has just two practical operations and gates the buyer messaging that drives reviews.

Three new rate-limit categories need to be added to `src/client/rate-limiter.ts:73-98` to avoid contention with existing tools: `listings`, `pricing`, `solicitations`. The `default` category would technically work but is too loose for write operations.

## Goals / Non-Goals

**Goals:**
- Expose full CRUD on listings, batched pricing queries, and buyer review requests.
- Enforce SP-API input shape and limits at the tool boundary via zod (batch size caps, SKU/ASIN format, required fields).
- Surface Amazon's `errors[].details` verbatim on write failures so Claude can show the seller the exact issue (e.g., "Attribute 'bullet_point' is required for product_type 'LUGGAGE'").
- Add comprehensive tests for input validation and successful call paths.

**Non-Goals:**
- Bulk feed submission via the Feeds API (deferred to phase 4).
- Image/media upload via the Listings Items API `submit_media` endpoint (separate surface, separate flow).
- Product Type Definitions API (very niche; rarely needed in agent flows).
- FBA inbound eligibility checks (different API).
- Repricer automation — this change exposes the data; building a loop is the seller's job.

## Decisions

### Decision 1: Per-marketplace tools with `marketplaceId` as a required zod field
**Why:** A SKU is unique per marketplace. A seller operating in US + EU has the same SKU as two different listings. The current config exposes a single `MARKETPLACE_ID`; the tools accept that as default but allow per-call override.

**Alternative considered:** A single tool with `marketplaceId` defaulted from config. Same effect, but breaks if the seller has multiple marketplaces and wants to query each. Per-call override is the more flexible choice and costs one zod field.

### Decision 2: Batch limits enforced client-side via zod `.max(...)`
**Why:** `get_competitive_summary` accepts up to 20 ASINs, `get_featured_offer_expected_price_batch` accepts up to 40 SKUs. A tool that lets Claude send 50 ASINs gets a 400 from Amazon with a generic error. Zod `.max(20)` / `.max(40)` fail fast with a clear message.

### Decision 3: `put_listing` accepts a strongly-typed zod subset, not arbitrary JSON
**Why:** Allowing arbitrary JSON lets Claude send invalid payloads (wrong field types, missing required fields for a given product_type). A typed subset — `product_type`, `attributes`, `fulfillment_availability`, `purchasable_offer`, `merchant_suggested_asin`, `condition` — catches most issues at validation time. Product-type-specific attributes (e.g., `bullet_point`, `material`) go in `attributes` as a `z.record(z.string(), z.unknown())` to allow product-type flexibility while still validating the top-level shape.

**Alternative considered:** Full `z.record(z.string(), z.unknown())` for the whole payload. Rejected because it pushes all validation to Amazon and surfaces opaque 4xx errors. The pre-validated top-level shape gives Claude better error messages for the common cases (missing required envelope fields).

### Decision 4: `patch_listing` strips undefined fields before the request (JSON Merge Patch semantics)
**Why:** Amazon's `patchListingsItem` uses JSON Merge Patch (RFC 7396): fields you send are replaced, fields you don't send are unchanged, fields you send as `null` are deleted. The tool accepts the same `ListingsItemPatch` shape as `put_listing` and strips any `undefined` properties from the JSON before the request body is built. This way Claude can send `{ attributes: { bullet_point: ["new"] } }` without accidentally deleting `merchant_suggested_asin`.

### Decision 5: `search_listings` paginates with `nextToken`, capped at 20 pages
**Why:** Listings can be in the thousands for a large catalog. Single-shot return would either truncate or return an unmanageable blob. `nextToken` from the response becomes the `pageToken` query param. The 20-page cap matches the `get_orders` cap and prevents runaway loops from a misbehaving agent.

### Decision 6: `request_product_review` validates the order status client-side before calling Solicitations
**Why:** Amazon returns 400 with a generic message if the order is not `Shipped`. The tool does a `get_order` first and refuses with a clear "order is in status 'Pending' — can only request a review after shipment" message. Costs one extra round-trip; saves a frustrating error and a wasted solicitation quota slot.

**Alternative considered:** Pass-through to Amazon. Rejected because the 400 message ("InvalidInput: Order is not eligible for product review") is opaque and Amazon documents this as a common 400 case.

## Risks / Trade-offs

- **[Risk] Listings write operations are destructive.** A bad `put_listing` call can overwrite a working listing or set a price to 0. → **Mitigation**: tool description explicitly says "irreversible", README documents the safe `search → get → patch` flow, and the `delete_listing` description has a separate, stronger warning.
- **[Risk] `get_competitive_summary` 403s for sellers without Buy Box enabled.** → **Mitigation**: surface the 403 as-is. Claude can guide the user to enable Buy Box in Seller Central.
- **[Risk] Listings write rate limits are tighter than the documented 5 rps for some tenants.** → **Mitigation**: the new `listings` category starts at 5 rps burst 10 (loose). We can tighten to 2 rps in a follow-up if Amazon throttles.
- **[Risk] PATCH operation correctness depends on Amazon's exact merge-patch interpretation of `null` vs `undefined`.** → **Mitigation**: the tool always sends only the fields the caller filled in (undefined fields are stripped). The `null`-to-delete case is documented in the tool description but is not a primary use case in this change.
- **[Trade-off] We do not expose `validateListingsItem` (the preview error endpoint).** Adding it doubles the surface for marginal value — Claude can just call `put_listing` and read the validation errors from the response.

## Migration Plan

Additive change, no migrations. Deploy steps:
1. `pnpm install` (no new deps).
2. `pnpm run typecheck && pnpm run lint && pnpm test` — all green.
3. `pnpm run build`.
4. Existing deployments restart transparently and gain 9 new tools.
5. Document the new tools in the README.

**Rollback:** revert commit. No state changes.

## Open Questions

All open questions from the planning conversation are resolved:
- A. `put_listing` payload flexibility → **subset predefinido vía zod** (Decision 3).
- B. `search_listings` pagination → **sí, con cap 20 páginas** (Decision 5).
- C. `request_product_review` validation → **client-side via get_order** (Decision 6).
