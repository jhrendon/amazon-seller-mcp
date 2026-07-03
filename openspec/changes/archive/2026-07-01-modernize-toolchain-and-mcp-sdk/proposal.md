## Why

The repo is pinned to `@modelcontextprotocol/sdk@^1.0.4` and uses the SDK's low-level `Server` + `setRequestHandler` API. Six months of SDK releases have shipped a much cleaner high-level API (`McpServer` + `registerTool`) with first-class `structuredContent` support, and a newer SDK also tightens type safety around tool registration. We're also missing a `typecheck` script (only `build` exists, so a wrong `import` only shows up when someone happens to run a build) and the jest config is wired but `tests/` is empty, so `npm test` runs zero tests and `npm run test:coverage` fails the 80% threshold.

This change brings the SDK and the local toolchain in line with what the rest of the MCP ecosystem has moved to, and unblocks a real test suite.

## What Changes

- **Bump `@modelcontextprotocol/sdk` from `^1.0.4` to `^1.29.0`.** (Latest 1.x; 1.0.4 is from late 2024.)
- **Migrate `src/index.ts` and `src/tools/index.ts` from the low-level `Server` + `setRequestHandler` pattern to the high-level `McpServer` + `registerTool` API.** All tool definitions are converted from `{ name, description, inputSchema, handler }` objects to `server.registerTool(name, { description, inputSchema }, handler)` calls. *BREAKING for anyone importing `registerAllTools` or the `Tool` shape directly, but no in-repo consumers exist.*
- **Tool handlers return both `content` and `structuredContent`.** Handlers currently stringify JSON into `{ type: 'text' }`; after this change each handler also returns the parsed object under `structuredContent` so SDK clients can consume the typed payload without re-parsing text.
- **Add a `typecheck` npm script (`tsc --noEmit`)** so type errors surface without a build.
- **Add a first real jest test** under `tests/` (csv-parser) so `npm test` and `npm run test:coverage` are no longer no-ops.
- **Update `AGENTS.md`** to reflect the new MCP SDK API and the new `typecheck` script.

## Capabilities

### New Capabilities

- `tool-registration`: contract for how Amazon SP-API tools are registered with the MCP server (schema, handler signature, response shape, error wrapping).
- `tool-response-shape`: contract for what an MCP tool handler must return — both human-readable `content` text and machine-readable `structuredContent`.

### Modified Capabilities

_None. The first two capabilities are net-new because no spec existed for them yet; tool behavior from the LLM's perspective (input parameters, return fields) is unchanged._

## Impact

- **Code:** `src/index.ts` (rewrite), `src/tools/index.ts` (rewrite), every `src/tools/**/*.ts` file (call-site change to use `McpServer.registerTool` instead of returning an array of tool objects). Tool *handler bodies* stay the same — they keep returning `{ content, structuredContent }` (additions, not removals).
- **Dependencies:** `@modelcontextprotocol/sdk` major version stays at 1.x but jumps ~29 minor versions. `axios` stays pinned at `1.14.0`. No other dep changes.
- **Configs:** `package.json` (add `typecheck` script, bump SDK). `tsconfig.json` unchanged.
- **Tests:** adds `tests/csv-parser.test.ts`; `jest.config.js` and `package.json` lint script are unchanged (they already reference `tests/`).
- **Docs:** `AGENTS.md` updates.
- **Downstream:** anyone calling `import { registerAllTools }` or `import { orderTools }` etc. as named arrays will break. The README example snippets import nothing from `src/` and are unaffected.
