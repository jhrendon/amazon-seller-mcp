## Context

`amazon-seller-mcp` currently exposes ~35 tools across orders, inventory, sales, catalog, finances, reports, invoices, fees, feedback, listings, pricing, and solicitations. The codebase follows a consistent pattern (`register<Group>Tools` functions that call `server.registerTool`), uses module-level singletons for the SP-API client, token manager, and rate limiters, and validates credentials before the MCP server starts.

The last waves of work added listings, pricing, solicitations, invoices, fees, and feedback. That growth surfaced three issues:

1. **Duplication**: money schemas, order-ID regex, marketplace-ID fallback, and the `{ content, structuredContent }` response shape are repeated across tools.
2. **Bugs**: incorrect column mapping for long-term storage fees, over-aggressive settlement deduplication, inflated sales-unit counts, missing pagination for order items, and missing axios timeout/retry handling.
3. **Coverage gaps**: large SP-API domains (FBA Inbound, Merchant Fulfillment, Data Kiosk, Restricted Data Token) and high-value reports are not exposed.

This design keeps the existing ESM/NodeNext architecture and singleton pattern intact, adds a thin shared layer for tool construction, fixes the bugs, and introduces the missing domains as new tool groups.

## Goals / Non-Goals

**Goals:**
- Reduce duplication across tool handlers by introducing shared schemas and helpers.
- Centralize report-based tools behind a single factory.
- Fix all known functional bugs in existing tools.
- Make the SP-API client resilient to mid-session token invalidation.
- Enable explicit multi-marketplace queries where SP-API supports them.
- Add FBA Inbound, Restricted Data Token, Merchant Fulfillment, Data Kiosk, and additional report tools.
- Improve test coverage for critical untested modules.
- Migrate ESLint to v9 flat config.

**Non-Goals:**
- Replacing axios or the MCP SDK; axios stays pinned at `1.14.0` and MCP SDK stays on v1.x.
- Adding the Notifications API (requires external AWS infrastructure such as SQS/EventBridge, out of scope for a stdio MCP server).
- Migrating to MCP SDK v2 until a stable release is available.
- Changing the public response shapes of existing successful tool calls (only incorrect data/behavior is fixed).

## Decisions

### 1. Shared helper module under `src/tools/_shared/`
**Decision**: Create `src/tools/_shared/schemas.ts`, `src/tools/_shared/response.ts`, and `src/tools/_shared/marketplace.ts`.
**Rationale**: Keeps tool code focused on SP-API logic while guaranteeing consistent validation, response formatting, and marketplace resolution. It avoids a generic "utils" dumping ground by scoping helpers to tool construction.
**Alternatives considered**: Inline helpers in each file (rejects duplication) or a top-level `src/shared/` (rejects because the helpers are tool-domain specific).

### 2. Report-tool factory
**Decision**: Add `src/tools/reports/_factory.ts` exposing `registerReportTool(name, options)` where `options` includes the report type, input schema, polling options, CSV parser config, and summary mapper.
**Rationale**: Reimbursements, fee reports, analytics reports, and the new report types all follow the same create→poll→download→parse→summarize flow. A factory removes ~60% of repeated code and makes adding a new report a one-file change.
**Alternatives considered**: A base class (rejected: codebase prefers plain functions) or keeping the current copy-paste pattern (rejected: high bug surface).

### 3. Automatic token refresh on 401
**Decision**: In `sp-api-client.ts`, catch HTTP 401 responses, call `tokenManager.clearCache()`, and retry the request once. Surface the 401 only if the retry also fails.
**Rationale**: Amazon can invalidate an access token mid-session. A single transparent retry is simpler than a full token-rotation subsystem and matches the existing singleton design.
**Alternatives considered**: Proactive refresh based on a shorter buffer (rejected: cannot predict external revocation) or exposing a manual refresh tool (rejected: leaks infrastructure concern to the LLM).

### 4. Multi-marketplace support via optional `marketplaceId`
**Decision**: Add an optional `marketplaceId` string to every marketplace-scoped tool input schema. The resolver falls back to `config.MARKETPLACE_ID` and validates the resolved ID against the participations already fetched at startup.
**Rationale**: Lets multi-region sellers query any marketplace they participate in without restarting the server, while preserving the current single-marketplace default behavior.
**Alternatives considered**: Separate config per request or a global "set marketplace" tool (rejected: stateful and harder to reason about).

### 5. New API domains as separate tool modules
**Decision**: Add `src/tools/fba-inbound.ts`, `src/tools/merchant-fulfillment.ts`, `src/tools/data-kiosk.ts`, and `src/auth/restricted-token.ts` (exposed via `src/tools/tokens.ts`).
**Rationale**: Mirrors the existing convention of one file per domain and keeps each module reviewable.

### 6. Type safety for `structuredContent`
**Decision**: Introduce a small generic helper `makeToolResponse<T>(payload: T)` that constrains `structuredContent` to `T` without casting to `Record<string, unknown>`.
**Rationale**: Removes the 18 `as unknown as Record<string, unknown>` casts while keeping the exact same runtime shape.

### 7. Testing strategy
**Decision**: Add focused unit tests for `token-manager`, `sp-api-client`, `rate-limiter`, `report-poller`, and each refactored tool group. Use the shared helper `makeServer` pattern already present in newer tests.
**Rationale**: These modules are the highest-risk untested surface. Unit tests with mocked `getSPAPIClient` are sufficient because the smoke probes already cover live SP-API validation.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Refactoring report tools introduces regressions in existing report output | Keep parser/summary behavior byte-compatible; add tests that assert against known CSV fixtures; run the smoke probes after build. |
| FBA Inbound v2024 API is large and complex | Expose only the most common operations first (list/get plan, list/get shipment, create plan); mark advanced operations as future work. |
| Restricted Data Token requires compliance with Amazon PII policies | Gate the capability behind explicit opt-in documentation; never log tokens; only expose the token-creation tool, never the raw PII endpoint directly unless the seller opts in. |
| Data Kiosk queries are asynchronous and long-running | Reuse the existing report-poller pattern with a longer default timeout; expose `pollOptions` in the tool schema. |
| ESLint 9 migration may conflict with existing rules | Migrate to a minimal flat config that preserves the current rule set; run lint before and after. |
| Adding many tools could exceed MCP client context limits | Group tools logically; do not register thousands of tools; document high-level use cases in tool descriptions. |

## Migration Plan

1. Merge shared-helper modules and update one existing tool (`fees.ts`) to validate the pattern.
2. Build the report-tool factory and migrate `reimbursements.ts` first.
3. Apply bug fixes independently so each fix is reviewable in isolation.
4. Add automatic 401 refresh and multi-marketplace resolver.
5. Migrate remaining report tools to the factory and add new report types.
6. Add new API domains (FBA Inbound, Merchant Fulfillment, Data Kiosk, Restricted Data Token).
7. Migrate ESLint to v9.
8. Add tests for uncovered critical modules and run full test suite + smoke probes.

**Rollback**: Each step is backwards compatible. If a new tool is unstable, it can be temporarily removed from `src/tools/index.ts` without affecting existing tools.

## Open Questions

- Should the settlement-report deduplication be changed to key by `(settlement_id, transaction_id)` or should Amazon's native grouping be preserved? Need to inspect a sample settlement report to decide.
- For Data Kiosk, should we expose raw GraphQL strings or pre-canned query templates? Pre-canned templates are safer for LLM use.
- For Restricted Data Token, which data elements (`buyerInfo`, `shippingAddress`, `buyerTaxInformation`) should be requestable by default?
