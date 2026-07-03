## 1. Types and contracts

- [x] 1.1 Add the Listings API types to `src/types/sp-api.ts`: `ListingsItem`, `ItemSummary`, `ItemAttributes`, `ItemIssue`, `FulfillmentAvailability`, `PurchasableOffer`, `ListingsItemPatch`, `ItemSearchResult`, `ItemSearchResponse`
- [x] 1.2 Add the Pricing API types: `CompetitiveSummaryRequest`, `CompetitiveSummaryResponse`, `CompetitiveSummaryResult`, `FeaturedOfferExpectedPriceRequest`, `FeaturedOfferExpectedPriceResponse`, `FeaturedOfferExpectedPriceResult`
- [x] 1.3 Add the Solicitations API types: `SolicitationAction`, `SolicitationActionsResponse`, `SolicitationResponse`
- [x] 1.4 Verify all new types are exported from `src/types/sp-api.ts`

## 2. Rate limiter additions

- [x] 2.1 Add `listings: { requestsPerSecond: 5, burstSize: 10 }` to `SP_API_RATE_LIMITS` in `src/client/rate-limiter.ts`
- [x] 2.2 Add `pricing: { requestsPerSecond: 0.5, burstSize: 5 }` to `SP_API_RATE_LIMITS`
- [x] 2.3 Add `solicitations: { requestsPerSecond: 1, burstSize: 5 }` to `SP_API_RATE_LIMITS`

## 3. Listings tool

- [x] 3.1 Create `src/tools/listings.ts` with the `registerListingsTools(server: McpServer): void` function exported
- [x] 3.2 Implement `get_listing` with zod input `{ sku: string, marketplaceId?: string }` (marketplaceId defaults to `getConfig().MARKETPLACE_ID`). Calls `GET /listings/2021-08-01/items/{sellerId}/{sku}` with `marketplaceIds` and `includedData` query params. Rate-limit category `listings`.
- [x] 3.3 Implement `search_listings` with zod input `{ marketplaceId?: string, status?: string, sku?: string, productType?: string, pageToken?: string, pageSize?: number }`. Calls `GET /listings/2021-08-01/items/{sellerId}` with `pageSize` capped at 20 pages internally. Returns `nextToken` when present.
- [x] 3.4 Implement `put_listing` with zod input including the pre-validated subset (`productType`, `attributes: z.record(z.string(), z.unknown())`, `fulfillmentAvailability`, `purchasableOffer`, `merchantSuggestedAsin`, `condition`). Calls `PUT /listings/2021-08-01/items/{sellerId}/{sku}`. Returns the submitted document and `submissionId`.
- [x] 3.5 Implement `patch_listing` with the same zod input as `put_listing` but all fields optional. Strip `undefined` fields from the body before sending. Call `PATCH /listings/2021-08-01/items/{sellerId}/{sku}`. If body is empty, return a "nothing to update" message without calling Amazon.
- [x] 3.6 Implement `delete_listing` with zod input `{ sku: string, marketplaceId?: string }`. Calls `DELETE /listings/2021-08-01/items/{sellerId}/{sku}`.
- [x] 3.7 Wire `registerListingsTools` into `src/tools/index.ts`

## 4. Pricing tool

- [x] 4.1 Create `src/tools/pricing.ts` with the `registerPricingTools(server: McpServer): void` function exported
- [x] 4.2 Implement `get_competitive_summary` with zod input `{ asin?: string, asins?: string[] (max 20), marketplaceId?: string }` (exactly one of `asin` / `asins` is required). Calls `POST /products/pricing/2022-05-01/competitiveSummary`. Rate-limit category `pricing`.
- [x] 4.3 Implement `get_featured_offer_expected_price_batch` with zod input `{ sku?: string, skus?: string[] (max 40), price: number, marketplaceId?: string }`. Calls `POST /products/pricing/2022-05-01/featuredOfferExpectedPriceBatch` with one `expectedPriceRequests` entry per SKU.
- [x] 4.4 Wire `registerPricingTools` into `src/tools/index.ts`

## 5. Solicitations tool

- [x] 5.1 Create `src/tools/solicitations.ts` with the `registerSolicitationsTools(server: McpServer): void` function exported
- [x] 5.2 Implement `get_solicitation_actions_for_order` with zod input `{ orderId: string }` (validated as `^\d{3}-\d{7}-\d{7}$`). Calls `GET /messaging/v1/orders/{orderId}/solicitation/actions`. Rate-limit category `solicitations`.
- [x] 5.3 Implement `request_product_review` with zod input `{ orderId: string }`. First calls `get_order_details` (via `getSPAPIClient()`); if the order status is not `Shipped`, refuse with a clear message. Otherwise call `POST /messaging/v1/orders/{orderId}/solicitations/productReviewAndSellerFeedback` with `{}`.
- [x] 5.4 Wire `registerSolicitationsTools` into `src/tools/index.ts`

## 6. Tests

- [x] 6.1 Create `tests/listings.test.ts` with mocked `getSPAPIClient`. Test: get_listing returns parsed item; put_listing strips undefined fields; patch_listing with empty input returns "nothing to update"; delete_listing 200; 404 surfaces verbatim.
- [x] 6.2 Create `tests/pricing.test.ts`. Test: get_competitive_summary with single ASIN, with 20 ASINs (succeeds), with 21 ASINs (rejected by zod); get_featured_offer_expected_price_batch with single SKU, with 40 SKUs, with 41 SKUs (rejected).
- [x] 6.3 Create `tests/solicitations.test.ts`. Test: get_solicitation_actions_for_order returns parsed actions; request_product_review on a Shipped order sends the POST; request_product_review on a Pending order returns a refusal message without calling Amazon.
- [x] 6.4 Test the listings/patch strip-undefined logic in isolation (pure function, no HTTP).

## 7. Documentation

- [x] 7.1 Add a "Listings" section to the README's "Available Tools" listing all 5 new tools with descriptions
- [x] 7.2 Add a "Pricing" section with the 2 new tools
- [x] 7.3 Add a "Solicitations" section with the 2 new tools
- [x] 7.4 Add example queries for each new tool
- [x] 7.5 Update the architecture tree in the README to include the 3 new tool files
- [x] 7.6 Update the Features list to mention listings write + pricing intelligence + buyer solicitation

## 8. Verification

- [x] 8.1 Run `pnpm run typecheck` — must pass
- [x] 8.2 Run `pnpm run lint` — must pass
- [x] 8.3 Run `pnpm test` — all new tests pass, existing tests still pass
- [x] 8.4 Run `pnpm run build` — produces updated `build/`
- [ ] 8.5 Manual smoke test: with valid credentials, `pnpm run dev` shows the existing `Validated seller ...` line followed by `Connected via stdio transport` (regression check — the new tools don't change boot)
- [ ] 8.6 Manual smoke test: invoke `get_listing` with a known SKU in the configured marketplace → returns the item document
- [ ] 8.7 Manual smoke test: invoke `get_competitive_summary` with a single ASIN → returns competitive summary
