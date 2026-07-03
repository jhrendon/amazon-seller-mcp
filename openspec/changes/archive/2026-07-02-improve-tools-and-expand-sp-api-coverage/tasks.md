## 1. Shared tool-building foundation

- [x] 1.1 Create `src/tools/_shared/schemas.ts` with `moneySchema`, `orderIdSchema`, `dateRangeSchema`, and `marketplaceIdSchema`.
- [x] 1.2 Create `src/tools/_shared/response.ts` with typed `makeToolResponse<T>(payload: T)`.
- [x] 1.3 Create `src/tools/_shared/marketplace.ts` with `resolveMarketplaceId(input?)` and participation validation.
- [x] 1.4 Replace duplicated `moneySchema`/`toMoney` in `src/tools/fees.ts` and `src/tools/pricing.ts` with shared schemas.
- [x] 1.5 Replace duplicated order-ID regex in `src/tools/orders.ts`, `src/tools/finances.ts`, and `src/tools/solicitations.ts` with shared schema.
- [x] 1.6 Migrate at least one existing tool (`fees.ts`) to use `makeToolResponse` and shared helpers as a pattern proof.

## 2. Bug fixes in existing tools

- [x] 2.1 Fix `get_longterm_storage_fees` column mapping in `src/tools/reports/fees.ts` to match the official SP-API report schema.
- [x] 2.2 Fix settlement deduplication in `src/tools/reports/settlements.ts` to use a composite transaction key.
- [x] 2.3 Fix `get_sales_summary` in `src/tools/sales.ts` to count only `NumberOfItemsShipped`.
- [x] 2.4 Add pagination to `get_order_items` in `src/tools/orders.ts`.
- [x] 2.5 Configure explicit axios `timeout` in `src/client/sp-api-client.ts` and retry `ECONNABORTED`.
- [x] 2.6 Remove duplicate `'summaries'` value from `src/tools/listings.ts` `includedDataValues`.

## 3. Report-tool factory

- [x] 3.1 Create `src/tools/reports/_factory.ts` with `registerReportTool(name, options)` covering report creation, polling, download, parse, and summarize.
- [x] 3.2 Refactor `src/tools/reports/reimbursements.ts` to use the factory.
- [x] 3.3 Refactor `src/tools/reports/fees.ts` to use the factory (excluding `get_longterm_storage_fees` if its parsing logic differs).
- [x] 3.4 Refactor `src/tools/reports/analytics.ts` to use the factory.
- [x] 3.5 Add tests for `src/tools/reports/_factory.ts` using mocked `requestAndDownloadReport` and CSV fixtures.

## 4. Client resilience

- [x] 4.1 Implement automatic token refresh on HTTP 401 in `src/client/sp-api-client.ts` with a single retry.
- [x] 4.2 Ensure token cache is not cleared for non-401 errors.
- [x] 4.3 Add unit tests for 401 retry, 403 passthrough, and timeout retry.

## 5. Multi-marketplace support

- [x] 5.1 Store validated marketplace participations in `src/config/index.ts` or `src/client/sellers-api.ts` after startup validation.
- [x] 5.2 Add optional `marketplaceId` input to all marketplace-scoped tools and resolve via shared helper.
- [x] 5.3 Validate resolved marketplace ID against participations and return a clear error if invalid.
- [x] 5.4 Add tests for marketplace resolution and validation.

## 6. Additional report types

- [x] 6.1 Add `get_fba_customer_returns` for `GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA`.
- [x] 6.2 Add `get_fba_inventory_planning` for `GET_FBA_INVENTORY_PLANNING_DATA`.
- [x] 6.3 Add `get_all_orders_report` for `GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL`.
- [x] 6.4 Add `get_market_basket_report` for `GET_BRAND_ANALYTICS_MARKET_BASKET_REPORT`.
- [x] 6.5 Add `get_repeat_purchase_report` for `GET_BRAND_ANALYTICS_REPEAT_PURCHASE_REPORT`.
- [x] 6.6 Add `get_inventory_ledger_detail` for `GET_LEDGER_DETAIL_VIEW_DATA`.
- [x] 6.7 Update `src/types/sp-api.ts` report-type constants as needed.

## 7. FBA Inbound API

- [x] 7.1 Add SP-API types for FBA Inbound v2024-03-20 to `src/types/sp-api.ts`.
- [x] 7.2 Create `src/tools/fba-inbound.ts` exposing `list_inbound_plans`, `get_inbound_plan`, `create_inbound_plan`, `list_inbound_plan_shipments`, and `get_inbound_shipment`.
- [x] 7.3 Register the new tools in `src/tools/index.ts`.
- [x] 7.4 Add unit tests for FBA Inbound tools with mocked client.

## 8. Restricted Data Token

- [x] 8.1 Add SP-API types for Tokens API 2021-03-01 to `src/types/sp-api.ts`.
- [x] 8.2 Create `src/auth/restricted-token.ts` with `createRestrictedDataToken(resources)`.
- [x] 8.3 Create `src/tools/tokens.ts` exposing `create_restricted_data_token`.
- [x] 8.4 Integrate optional RDT usage into PII-needing tools (starting with `get_order_details`).
- [x] 8.5 Add unit tests for token creation and integration.

## 9. Merchant Fulfillment API

- [x] 9.1 Add SP-API types for Merchant Fulfillment v0 to `src/types/sp-api.ts`.
- [x] 9.2 Create `src/tools/merchant-fulfillment.ts` exposing `get_eligible_shipping_services`, `create_shipment`, `get_shipment`, and `cancel_shipment`.
- [x] 9.3 Register the new tools in `src/tools/index.ts`.
- [x] 9.4 Add unit tests for Merchant Fulfillment tools with mocked client.

## 10. Data Kiosk API

- [x] 10.1 Add SP-API types for Data Kiosk 2023-11-15 to `src/types/sp-api.ts`.
- [x] 10.2 Create `src/tools/data-kiosk.ts` exposing `create_data_kiosk_query`, `get_data_kiosk_query`, and `list_data_kiosk_queries`.
- [x] 10.3 Reuse `report-poller` utilities for document download when a query is `DONE`.
- [x] 10.4 Register the new tools in `src/tools/index.ts`.
- [x] 10.5 Add unit tests for Data Kiosk tools.

## 11. Type safety and tooling

- [x] 11.1 Replace `as unknown as Record<string, unknown>` casts in tool handlers with typed `makeToolResponse` calls.
- [x] 11.2 Migrate ESLint configuration from `.eslintrc.cjs` to `eslint.config.js` (flat config) and update `package.json` scripts.
- [x] 11.3 Run `pnpm run lint`, `pnpm run typecheck`, and `pnpm test` after all refactors.

## 12. Test coverage

- [x] 12.1 Add `tests/token-manager.test.ts` covering cache, refresh, and concurrent refresh deduplication.
- [x] 12.2 Add `tests/sp-api-client.test.ts` covering interceptors, retries, and `SPAPIError` details.
- [x] 12.3 Add `tests/rate-limiter.test.ts` covering token bucket behavior.
- [x] 12.4 Add `tests/report-poller.test.ts` covering polling, download, and gzip handling.
- [x] 12.5 Add `tests/orders.test.ts`, `tests/sales.test.ts`, `tests/inventory.test.ts`, and `tests/finances.test.ts`.
- [x] 12.6 Run `pnpm run test:coverage` and verify no new regressions (threshold may still be aspirational).

## 13. Validation and smoke tests

- [x] 13.1 Run `pnpm run build` and verify compilation succeeds.
- [x] 13.2 Run `pnpm run lint` and `pnpm run typecheck` with zero errors.
- [x] 13.3 Update `README.md` with new tools and any changed behavior.
- [ ] 13.4 Run smoke probes in `scripts/` against a populated `.env` if a live SP-API environment is available.
