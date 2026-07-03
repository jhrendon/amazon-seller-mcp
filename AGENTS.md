# AGENTS.md

MCP server that exposes Amazon SP-API (Selling Partner API) to Claude via stdio transport. Single package, TypeScript, ESM, Node 18+.

## Commands

| Goal | Command |
|---|---|
| Dev run (no build) | `pnpm run dev` (uses `tsx`) |
| Compile | `pnpm run build` (tsc → `build/`) |
| Typecheck (no emit) | `pnpm run typecheck` |
| Run compiled | `pnpm start` |
| Tests | `pnpm test` |
| Coverage | `pnpm run test:coverage` |
| Lint | `pnpm run lint` |
| Format | `pnpm run format` |

This project uses pnpm as its package manager (see `package.json#packageManager`).

## Gotchas

- **`axios` is pinned to `1.14.0` exactly.** Do not bump. Versions `1.14.1` / `0.30.4` were a trojanized supply-chain incident (March 2026). README has the full advisory.
- **`tests/` is the canonical test directory.** `pnpm run lint` and `vitest.config.ts` both scan `tests/**/*.test.ts`; the dir is excluded from `tsconfig.json`'s `include` so test files won't be type-emitted into `build/`. The 80% global coverage threshold in `vitest.config.ts` is aspirational — `pnpm run test:coverage` will fail it until more modules have dedicated tests.
- **Root-level `scripts/test-*.mjs` smoke probes are not vitest tests** — they're ad-hoc scripts that hit the live SP-API. They `import` from `../build/...`, so `pnpm run build` must run first, and a populated `.env` is required. Run them with `node scripts/<name>.mjs`.
- **ESM + NodeNext throughout.** Relative imports use the `.js` extension even for `.ts` sources (e.g. `from './config/index.js'`). `tsc` rewrites them; Vitest resolves `.js` → `.ts` natively via Vite. Don't drop the `.js` extensions.
- **`.env` is mandatory at startup.** `validateConfig()` in `src/config/index.ts` runs before the MCP server connects and `process.exit(1)`s on any missing LWA/Seller var. Copy from `.env.example`.
- **LWA-only auth — no AWS credentials.** `src/client/sp-api-client.ts` attaches the LWA access token via the `x-amz-access-token` header; there is no SigV4 signing.
- **Singletons.** `getSPAPIClient()`, `getTokenManager()`, and `getRateLimiter(category)` are all module-level singletons. Tests that need to reset state should call `tokenManager.clearCache()` rather than re-importing.
- **Rate limits are baked in per category** in `src/client/rate-limiter.ts:73` (`orders`, `orderItems`, `createReport`, `getReports`, `getReport`, `getReportDocument`, `sales`, `inventory`, `catalog`, `finances`, `default`). When adding a new tool, pick a category or add one — the client will fall back to `default` if you don't.
- **Report tools take time.** `pollReportCompletion` defaults to a 5-minute timeout with 30s intervals. Async reports can exceed this; surface `pollOptions` if the user needs longer.

## Architecture

- `src/index.ts` — entry point. Validates config, constructs an `McpServer` (high-level SDK API), calls `registerAllTools`, connects `StdioServerTransport`. Crashes the process on uncaught errors.
- `src/config/index.ts` — zod-validated env loading + `MARKETPLACE_IDS` / `SP_API_ENDPOINTS` reference tables. Add new env vars here.
- `src/auth/token-manager.ts` — LWA OAuth refresh-token flow with 5-minute pre-expiry buffer and concurrent-refresh dedup.
- `src/client/sp-api-client.ts` — axios client with per-category rate limiting, exponential-backoff retry, and structured `SPAPIError` (incl. `SPAPIError.details` from Amazon's `errors[].details` field — do not drop it).
- `src/utils/report-poller.ts` — `requestAndDownloadReport(reportType, options)` wraps create→poll→download→gunzip. Use this for any new report-based tool.
- `src/utils/csv-parser.ts` — tab/comma delimited with quote handling. Headers are lowercased + snake-cased via `normalizeHeader`.
- `src/tools/{orders,inventory,sales,catalog,finances}.ts` + `src/tools/reports/{reimbursements,settlements,fees,analytics}.ts` — each exports a `register<Group>Tools(server: McpServer): void` function that calls `server.registerTool(name, { description, inputSchema: <zod> }, async (input) => { ... })` once per tool. Register a new tool by adding a `server.registerTool(...)` call inside the appropriate group's `register<Group>Tools` function. `src/tools/index.ts` (and `src/tools/reports/index.ts`) just calls each group's register function.
- `src/types/sp-api.ts` — Amazon response types plus the `REPORT_TYPES` constants. Add new report-type strings here.

Each tool handler must return `{ content: [{ type: 'text', text: JSON.stringify(...) }], structuredContent: <parsed object> }` — the text channel is byte-identical to the pre-modernization output for clients that only read text, and `structuredContent` exposes the typed payload to clients that prefer JSON. Throw on unrecoverable errors; `McpServer` wraps thrown errors as `isError: true` results.

## Testing

`vitest.config.ts` is the test runner config. Add tests under `tests/**/*.test.ts` (the `tests/` dir is excluded from `tsconfig.json`'s `include`, so test files won't be type-emitted into `build/`). Use Vitest's `describe` / `it` / `expect`. The 80% global coverage threshold in `vitest.config.ts` is aspirational — only a handful of modules have dedicated tests, so `pnpm run test:coverage` will still fail the threshold until more tests are added.

## Local skills

`.agents/skills/` and `.claude/skills/` contain `typescript-mcp-server-generator` and `typescript-advanced-types` — load them when generating new tools or types.
