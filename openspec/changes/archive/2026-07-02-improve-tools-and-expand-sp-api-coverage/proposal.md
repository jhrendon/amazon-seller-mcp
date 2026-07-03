## Why

The `amazon-seller-mcp` server has grown from a small core into a multi-tool SP-API bridge, but this rapid expansion has introduced duplicated code, inconsistent UX, a handful of real bugs, and large functional gaps versus the SP-API surface. This change consolidates the existing tools on a shared foundation, fixes the bugs that silently produce wrong data, and adds the highest-value missing SP-API capabilities (FBA Inbound, Restricted Data Token, Merchant Fulfillment, Data Kiosk) so sellers can operate more of their business through the MCP interface.

## What Changes

- Introduce shared tool-building primitives (`moneySchema`, `orderIdSchema`, `dateRangeSchema`, `makeToolResponse`, marketplace resolver) to remove duplication across handlers.
- Create a report-tool factory that centralizes the create→poll→download→parse→summarize flow, then migrate `reimbursements`, `fees`, `analytics`, and new report tools to it.
- Fix functional bugs in existing tools:
  - Correct column mapping in `get_longterm_storage_fees`.
  - Fix `settlement_report` deduplication logic so multi-row settlements are not collapsed.
  - Exclude unshipped items from `get_sales_summary` unit counts.
  - Add pagination to `get_order_items`.
  - Configure an explicit axios `timeout` and retry `ECONNABORTED`.
- Add automatic access-token refresh on HTTP 401 in the SP-API client.
- Add optional `marketplaceId` support to all marketplace-scoped tools, validated against the seller's validated marketplace participations.
- Add new tool groups:
  - **FBA Inbound API v2024-03-20** (`list_inbound_plans`, `get_inbound_plan`, `create_inbound_plan`, `list_inbound_plan_shipments`, `get_inbound_shipment`).
  - **Restricted Data Token** (`create_restricted_data_token`) to enable PII access for eligible sellers.
  - **Merchant Fulfillment API** (`get_eligible_shipping_services`, `create_shipment`, `get_shipment`, `cancel_shipment`).
  - **Data Kiosk API** (`create_data_kiosk_query`, `get_data_kiosk_query`, `list_data_kiosk_queries`).
  - **Additional report types**: FBA customer returns, FBA inventory planning, flat-file all orders, brand-analytics market basket, brand-analytics repeat purchase, ledger detail view.
- Migrate ESLint to v9 flat config and improve type safety by reducing `as unknown as Record<string, unknown>` casts.
- Add tests for currently uncovered critical modules (`orders`, `sales`, `inventory`, `finances`, `report-poller`, `token-manager`, `sp-api-client`, `rate-limiter`, `reports/*`).

## Capabilities

### New Capabilities

- `shared-tool-helpers`: shared Zod schemas, response builders, and marketplace resolution utilities for all tools.
- `report-tool-factory`: generic factory for report-based tools that handles create/poll/download/parse/summarize.
- `automatic-token-refresh`: transparent re-fetch of the LWA access token when the SP-API client receives a 401.
- `multi-marketplace-support`: allow callers to pass an explicit `marketplaceId` while keeping the env var as fallback.
- `bug-fixes-existing-tools`: corrections to long-term storage fees, settlement deduplication, sales unit counting, order-items pagination, and axios timeouts.
- `fba-inbound-api`: expose FBA Inbound v2024-03-20 planning and shipment operations.
- `restricted-data-token`: expose the Tokens API to request restricted data tokens for PII access.
- `merchant-fulfillment-api`: expose MFN shipping-service selection, shipment creation, and cancellation.
- `data-kiosk-api`: expose Data Kiosk query creation and retrieval.
- `additional-report-types`: expose high-value report types not yet available as tools.

### Modified Capabilities

- `tool-response-shape`: tighten the TypeScript typing of `structuredContent` outputs so handlers no longer need broad `unknown` casts; the user-visible shape remains unchanged.

## Impact

- **Source code**: new files under `src/tools/`, `src/tools/_shared/`, `src/auth/`, and `src/client/`; refactors of `src/tools/reports/*`, `src/tools/fees.ts`, `src/tools/pricing.ts`, `src/tools/orders.ts`, `src/tools/sales.ts`, `src/tools/listings.ts`.
- **Dependencies**: ESLint 8 → ESLint 9 migration; axios stays pinned at `1.14.0`; MCP SDK stays on v1 until v2 is stable.
- **Tests**: new test files for previously uncovered modules; existing tests updated to use shared helpers.
- **Runtime behavior**: corrected numeric outputs, safer network behavior, broader SP-API coverage; no breaking changes to existing tool names or successful response shapes.
