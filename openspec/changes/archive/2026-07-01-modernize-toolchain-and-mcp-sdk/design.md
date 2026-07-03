## Context

The repo exposes Amazon SP-API as MCP tools over stdio. Today, `src/index.ts` builds a low-level `Server` and `src/tools/index.ts` wires request handlers (`ListToolsRequestSchema`, `CallToolRequestSchema`) that look up tools in a flat array of `{ name, description, inputSchema, handler }` objects. Each tool module (`src/tools/orders.ts`, etc.) exports that array.

`@modelcontextprotocol/sdk` has since shipped `McpServer`, a higher-level wrapper that exposes a `registerTool(name, config, handler)` API. The new API:
- takes a zod (or JSON-Schema) `inputSchema` and a typed handler with parsed inputs
- lets the handler return `{ content, structuredContent }` where `structuredContent` is the typed JSON object — clients no longer have to re-parse the `text` blob
- removes the boilerplate `setRequestHandler` calls and the manual `isError` wrapping
- ships proper TS types for the request/response envelopes

The current code is workable but every new tool requires three touch points (define shape, add to array, add to `allTools` lookup). With `registerTool` it collapses to one. It also can never expose `structuredContent` to clients.

Separately, there is no way to typecheck without emitting — `npm run build` is the only thing that runs `tsc`. And `tests/` is empty, so `npm test` is a no-op and `npm run test:coverage` fails the 80% threshold defined in `jest.config.js`.

## Goals / Non-Goals

**Goals:**
- Move to the high-level MCP SDK API so tool registration is one call per tool and structured payloads are exposed.
- Add `npm run typecheck` (`tsc --noEmit`) so a wrong import surfaces without a build.
- Land at least one real jest test so `npm test` is not a no-op and `npm run test:coverage` is at least possible.
- Keep behavior observable from the LLM's perspective identical: same tool names, same input schemas, same return fields.

**Non-Goals:**
- Bumping `axios` (already pinned to `1.14.0` for security reasons; do not touch).
- Switching to MCP SDK 2.x (stays on 1.x latest, 1.29.0).
- Rewriting tool handler logic. Only the registration layer and return-shape change.
- Adding tests for every tool — first test is just to unblock the harness; follow-up tests are a separate change.
- Changing `tsconfig.json` settings or ESLint rules.

## Decisions

### D1. Stay on SDK 1.x (1.29.0), not 2.x

SDK 2.0 introduces breaking transport changes and is not yet broadly adopted. 1.29.0 ships the high-level `McpServer` API we want and keeps us compatible with existing MCP client versions. Revisit 2.x in a follow-up.

*Alternative considered:* jump to 2.x. Rejected: bigger blast radius, less battle-tested, no client pressure to do it now.

### D2. Use `McpServer.registerTool` per call, not a wrapper

`McpServer` accepts a zod shape for `inputSchema` and a handler that receives already-parsed args. We pass each tool's existing zod schema directly, and the handler body keeps its existing `client.get(...)` / `client.post(...)` calls. The only handler-side change is returning `structuredContent` in addition to `content`.

We do **not** invent a `registerAllTools(server, [...tools])` wrapper, even though it would minimize diff. The SDK's own API is already terse, and inventing a wrapper would just re-create the abstraction layer the migration is removing.

### D3. Tool modules keep their array shape, but the array is a registration side-effect

Each `src/tools/*.ts` file currently does:

```ts
export const orderTools = [{ name, description, inputSchema, handler }, ...];
```

After: each file calls `server.registerTool(...)` inside a new exported `register(server: McpServer): void` function. `src/tools/index.ts` then becomes:

```ts
export function registerAllTools(server: McpServer): void {
  registerOrderTools(server);
  registerInventoryTools(server);
  // ...
}
```

This keeps each tool module cohesive (its tools, its registration call) without needing a parallel array of metadata just to drive the SDK.

*Alternative considered:* keep the array, add a parallel `register(server)` export. Rejected: redundant; the array's only consumer was the old `setRequestHandler` loop.

### D4. `structuredContent` shape is the same object that was being stringified

Today each handler ends with `JSON.stringify({...summary fields...}, null, 2)`. The new handler returns:

```ts
return {
  content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
  structuredContent: summary,
};
```

`summary` is typed as `object` (zod's `z.object` plus a passthrough / zod's record type for the loose cases). The text channel is preserved for clients that only read text.

*Alternative considered:* drop `content` and serve `structuredContent` only. Rejected: text is the universal fallback, and existing clients of the LLM's tool loop depend on it.

### D5. New `typecheck` script is `tsc --noEmit`

Mirrors the existing `build` script (`tsc`) minus emit. Same `tsconfig.json`, same flags, just `--noEmit`. No new dependency.

### D6. First jest test covers `csv-parser`

`src/utils/csv-parser.ts` is the most testable surface: pure function, no I/O, no singletons, no env. The test exercises tab/comma delimiter, quoted values, header normalization, and the type-coercion helper. Picking this module also lets `npm run test:coverage` clear the 80% bar for that single file (the parser is small and well-isolated).

*Alternative considered:* test `rate-limiter` first. Rejected: it has time-based behavior that's awkward to assert without fake timers. Test `token-manager`? Also rejected: it would require mocking the `axios` post call and the env, more scaffolding.

### D7. Update `AGENTS.md` in the same change

`AGENTS.md` currently describes the `setRequestHandler`-based architecture. After this change that section is wrong. Add a short note that registration now goes through `McpServer.registerTool`.

## Risks / Trade-offs

- **Risk:** SDK 1.29.0 is ~29 minor versions ahead of what we use today. Even within 1.x, things have moved. → **Mitigation:** the surface we touch is small (`McpServer`, `registerTool`, `StdioServerTransport`). Bump, build, smoke-test the existing `test-api.mjs` smoke script against the new build.
- **Risk:** Removing the exported `orderTools` / `inventoryTools` / `allReportTools` arrays breaks any external consumer importing them as named arrays. → **Mitigation:** there is no in-repo consumer; README does not show importing from `src/`; the `tests/` smoke scripts in the repo root use the built output and only import `getSPAPIClient` / `getConfig`, not the tool arrays.
- **Risk:** Adding `structuredContent` without a content change can confuse an MCP client that only reads `content`. → **Mitigation:** `content` is unchanged (same `JSON.stringify(summary, null, 2)` text). `structuredContent` is purely additive.
- **Risk:** A single test in `tests/` keeps `npm test` working but the 80% coverage threshold is global. If the threshold is computed over all of `src/**` the first test will not clear it. → **Mitigation:** the parser is the only file with assertions, so coverage over `src/utils/csv-parser.ts` will be 100% but global statements/lines will still be far below 80%. Either lower the threshold in a follow-up or add more tests as part of this same change if the user wants coverage green. The `tasks.md` flags this.
- **Risk:** `registerAllTools` signature changes from `(server: Server) => void` to `(server: McpServer) => void`. `src/index.ts` is the only caller; trivial update. → **Mitigation:** none needed; both updates land in the same change.

## Migration Plan

1. Bump `@modelcontextprotocol/sdk` in `package.json`, run `npm install`, verify `npm run build` still passes.
2. Rewrite `src/tools/index.ts` to call `register<Group>Tools(server)` functions.
3. In each `src/tools/*.ts`, replace the `export const xTools = [...]` array with a `registerXTools(server: McpServer): void` function that calls `server.registerTool(...)` per tool, and add `structuredContent` to each handler's return.
4. Rewrite `src/index.ts` to construct `McpServer` and call `registerAllTools(server)`.
5. Add `typecheck` script to `package.json`.
6. Add `tests/csv-parser.test.ts`.
7. Update `AGENTS.md`.
8. Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:coverage`. Investigate any new failures.
9. Run `npm run build` then `node test-api.mjs` against a populated `.env` to smoke-test the live integration. (Skip if no creds available.)

**Rollback:** revert the commit. No data migration, no API surface for downstream users.

## Open Questions

- **Coverage threshold:** keep `jest.config.js`'s 80% global threshold and add more tests, or lower the threshold to match reality and add tests incrementally? Defaulting to "lower the threshold to a realistic ~40% in a follow-up" — flagged in `tasks.md` so it's explicit.
- **2.x upgrade:** track SDK 2.x separately. Out of scope for this change.
