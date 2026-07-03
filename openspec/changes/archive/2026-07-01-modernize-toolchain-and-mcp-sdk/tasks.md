## 1. Bump the MCP SDK

- [x] 1.1 In `package.json`, change `"@modelcontextprotocol/sdk": "^1.0.4"` to `"@modelcontextprotocol/sdk": "^1.29.0"`. Do not change the `axios` pin.
- [x] 1.2 `pnpm install` clean; `@modelcontextprotocol/sdk@1.29.0` resolved.
- [x] 1.3 `pnpm run build` clean — low-level `Server` + `setRequestHandler` API still compiles against 1.29.0 (no breaking changes in the surface we touch).

## 2. Rewrite the server entry and central registry

- [x] 2.1 Rewrite `src/index.ts` to construct `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` (instead of `Server` from `@modelcontextprotocol/sdk/server/index.js`) with the existing name/version and `tools: {}` capability, then call `registerAllTools(server)` and connect `StdioServerTransport`.
- [x] 2.2 Rewrite `src/tools/index.ts` so it no longer imports `Server`, `CallToolRequestSchema`, or `ListToolsRequestSchema`, no longer defines the `Tool` interface, and no longer installs request handlers. The new module exports `registerAllTools(server: McpServer): void` which calls `registerOrderTools`, `registerInventoryTools`, `registerSalesTools`, `registerCatalogTools`, `registerFinanceTools`, and `registerAllReportTools`.

## 3. Convert each tool group to registerTool

For each module below, replace the `export const xTools = [...]` array with `export function register<Group>Tools(server: McpServer): void` that calls `server.registerTool(name, { description, inputSchema: <zod schema> }, async (input) => { ... })` once per tool. The handler body keeps its existing `client.get/post` calls. The handler's return value adds `structuredContent` alongside the existing `content`. Do not change tool names, descriptions, or input field semantics.

- [x] 3.1 `src/tools/orders.ts` — `get_orders`, `get_order_details`, `get_order_items`.
- [x] 3.2 `src/tools/inventory.ts` — `get_inventory_summary`, `get_fba_inventory_details`.
- [x] 3.3 `src/tools/sales.ts` — `get_sales_metrics`.
- [x] 3.4 `src/tools/catalog.ts` — `get_catalog_item`, `search_catalog_items`.
- [x] 3.5 `src/tools/finances.ts` — finance tools.
- [x] 3.6 `src/tools/reports/reimbursements.ts` — reimbursement tools (uses `requestAndDownloadReport` + `parseCSV`).
- [x] 3.7 `src/tools/reports/settlements.ts` — settlement tools.
- [x] 3.8 `src/tools/reports/fees.ts` — fee tools (FBA fees, storage, LTSF).
- [x] 3.9 `src/tools/reports/analytics.ts` — sales/traffic, search terms, inventory ledger.
- [x] 3.10 `src/tools/reports/index.ts` — replace the `allReportTools` array with `export function registerAllReportTools(server: McpServer): void` that calls each reports group's register function.

## 4. Add structuredContent to every handler return

- [x] 4.1 For each handler migrated in step 3, take the object that was being `JSON.stringify`-ed into `content[0].text` and assign it to both `content[0].text` (stringified) and `structuredContent` (the object itself). Keep `content[0].text` byte-identical to the pre-migration output. Verified by spot-grep + `pnpm run build` clean.

## 5. Toolchain: add typecheck

- [x] 5.1 In `package.json`, add `"typecheck": "tsc --noEmit"` to the `scripts` block. Do not modify `build`, `dev`, `start`, `test`, `test:coverage`, `lint`, or `format`.

## 6. Add the first jest test

- [x] 6.1 Create `tests/csv-parser.test.ts` (note the `tests/` directory is excluded from `tsconfig.json`'s `include`, so this file will not be emitted into `build/`). Use ESM imports with the `.js` extension (`from '../src/utils/csv-parser.js'`). Test cases covered: tab-delimited, comma-delimited with quoted delimiters, empty input, header normalization, `parseCSVRow` type coercion, missing values, truthy booleans.
- [x] 6.2 Run `pnpm test` and confirm exactly one test file runs and all assertions pass.

## 7. Update AGENTS.md

- [x] 7.1 In `AGENTS.md`, update the `Architecture` section: remove references to `setRequestHandler`, mention that registration goes through `McpServer.registerTool`, and note that handlers return `{ content, structuredContent }`.
- [x] 7.2 In the `Commands` table of `AGENTS.md`, add `Typecheck | pnpm run typecheck` row. Also split the old "Compile + typecheck" row into separate `Compile` and `Typecheck` rows.

## 8. Verification

- [x] 8.1 `pnpm run build` clean.
- [x] 8.2 `pnpm run typecheck` clean.
- [x] 8.3 `pnpm run lint` clean (now also lints the new `tests/csv-parser.test.ts`). Pre-existing failure on missing `tests/` dir is resolved by 6.1.
- [x] 8.4 `pnpm test` — exactly one test file, 8/8 assertions pass.
- [x] 8.5 `pnpm run test:coverage` — global 8.33% / 8.9% / 5.06% / 8.4% (statements/branches/functions/lines). csv-parser.ts is 96.82% covered; everything else 0% (only one test file exists). 80% global threshold fails — flagged in `design.md` as an open question. **Report to user**: global coverage threshold not met; consider either adding more tests or lowering the threshold.
- [x] 8.6 Skipped — no populated `.env` available in the working environment. Live smoke test deferred to the developer with credentials.
