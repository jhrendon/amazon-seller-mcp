## Why

The server can **read** a seller's catalog, orders, inventory, and sales, but it cannot **write** anything to Amazon. A seller asking Claude "update my listing price to $24.99", "what's the lowest price my competitor is charging?", or "request a review from this buyer for order 111-..." gets nothing today. The Listings Items API, Product Pricing API, and Solicitations API together close the read-only gap and are the three most-requested write-side capabilities among sellers.

## What Changes

- Expose the **Listings Items API** (v2021-08-01) as 5 tools: `get_listing`, `search_listings`, `put_listing` (create or fully replace), `patch_listing` (partial update), `delete_listing`. Each tool targets a specific Amazon marketplace; SKU is the user-facing identifier. Required SP-API role: `Product Listing`.
- Expose the **Product Pricing API** (v2022-05-01) as 2 tools: `get_competitive_summary` (batched, up to 20 ASINs) and `get_featured_offer_expected_price_batch` (FOEP, up to 40 SKUs). Required role: `Pricing`.
- Expose the **Solicitations API** (v1) as 2 tools: `get_solicitation_actions_for_order` (preview which solicitation types are available) and `request_product_review` (send the review request to a buyer for a delivered order, with a client-side `Shipped` status check). Required role: `Solicitation`.
- Add new rate-limit categories `listings`, `pricing`, and `solicitations` to `src/client/rate-limiter.ts`.
- Add new response/request types to `src/types/sp-api.ts`.
- Register all new tools through three new files: `src/tools/listings.ts`, `src/tools/pricing.ts`, `src/tools/solicitations.ts`. Wire them in `src/tools/index.ts`.
- Document the new tools in the README.

**No breaking changes** for existing tools. New tools are additive.

## Capabilities

### New Capabilities
- `listings-management`: Create, read, update, and delete product listings on Amazon Seller Central via the Listings Items API. Includes search by identifier, full and partial updates, and deletion.
- `pricing-intelligence`: Retrieve competitor pricing summaries and the Featured Offer Expected Price (FOEP) for batched sets of ASINs/SKUs, enabling repricers and competitive analysis.
- `buyer-solicitation`: Discover available solicitation actions for an order and request a product review from a buyer for a delivered order.

### Modified Capabilities
- None. The existing `tool-registration` and `tool-response-shape` specs do not change.

## Impact

- **Code**: 3 new tool files (~600 lines total), types additions (~200 lines), rate-limiter table (+3 categories), `tools/index.ts` registration. No core infra changes.
- **Dependencies**: None new. Uses existing `axios`, `zod`, `SPAPIClient`, `getConfig`, rate limiter.
- **Rate limits**: New categories `listings` (5 rps, burst 10), `pricing` (0.5 rps, burst 5), `solicitations` (1 rps, burst 5). Numbers per SP-API usage plans; conservative defaults.
- **Permissions**: The user's SP-API app must have the `Product Listing`, `Pricing`, and `Solicitation` roles assigned. The existing startup credential validation surfaces a 403 if any role is missing — no new validation needed.
- **Tests**: New `tests/listings.test.ts`, `tests/pricing.test.ts`, `tests/solicitations.test.ts` — each tool exercised with mocked `SPAPIClient` methods via `vi.mock`. Zod schema validation tests for input edge cases (batch size limits, SKU format).
- **Operational**: Listings writes are destructive. Tool descriptions and the README explicitly call this out, and the recommended flow is `search_listings` → `get_listing` → `patch_listing` for any change.
