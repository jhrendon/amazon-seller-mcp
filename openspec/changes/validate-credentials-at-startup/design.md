## Context

`src/index.ts` runs `validateConfig()` then immediately constructs the `McpServer` and connects `StdioServerTransport`. The validation today is pure schema (`z.string().min(1)` for each required env var), see `src/config/index.ts:6-16`. This means a `.env` containing placeholder values like `LWA_CLIENT_ID=tu_client_id` passes the gate. The user sees "Connected via stdio transport" and assumes the server is functional, but the first MCP tool invocation will surface an opaque 401/403 from Amazon hours or days later.

Two singletons already exist that we can lean on without modification:
- `TokenManager` (`src/auth/token-manager.ts`) — already implements the LWA refresh-token exchange with error wrapping. Its `refreshToken()` method is private, but the public `getAccessToken()` triggers it on cache miss.
- `SPAPIClient` (`src/client/sp-api-client.ts`) — already attaches the LWA token via the `x-amz-access-token` interceptor, applies rate limiting, and converts axios errors to structured `SPAPIError` instances (preserving `statusCode`, `code`, and `details`).

The change must reuse these without coupling the validator to them, because unit tests cannot reach module-level singletons reliably. Hence the "seam wrapper" pattern: small modules that expose a function the validator can call, with the wrapper internally calling the singleton.

## Goals / Non-Goals

**Goals:**
- Detect bad LWA credentials, bad SP-API app registration, wrong SELLER_ID, and wrong MARKETPLACE_ID **before** the MCP transport connects.
- Emit a specific, actionable error message naming the failing dimension.
- Populate the `TokenManager` cache so the first real tool call does not pay the refresh cost.
- Log a one-line success summary to stderr.
- Be fully unit-testable without touching the live `TokenManager` / `SPAPIClient` singletons or any network.

**Non-Goals:**
- Replacing or modifying `validateConfig()`. Schema validation stays synchronous and unchanged.
- Adding a logger module / structured logging. Out of scope for this change.
- New rate-limit category for the sellers API — `default` is sufficient for a single boot-time call.
- Validating that any specific tool will succeed. We validate credentials + seller + marketplace participation; specific-tool authorization is not testable at boot.
- Surfacing validation results to MCP clients. The MCP server does not connect until validation passes, so there is no client to surface to.

## Decisions

### Decision 1: Two real network calls (LWA exchange + marketplaceParticipations), not a single "ping"

**Why:** A single ping cannot distinguish "LWA creds are bad" from "seller doesn't exist" from "marketplace is wrong" — all three look like 401/403 from a generic SP-API call. Splitting into the LWA exchange first then a token-required sellers API call gives us two distinct failure surfaces with two distinct error messages.

**Alternatives considered:**
- *Single `getOrders` ping*: 0.0167 rps rate limit, 1-minute class. Far too heavy for a boot-time check; also fails on legitimate empty-seller accounts.
- *Single `getInventory` ping*: 403s for non-FBA sellers → false negative on a valid seller.
- *Single `getCatalog` ping*: validates only the token and the regional endpoint, not the seller.

### Decision 2: `/sellers/v1/marketplaceParticipations` as the SP-API probe

**Why:** This endpoint is Amazon's canonical "who am I, where do I participate" endpoint. It requires no query params, no body, has no quota cost, and returns a list that lets us cross-check the configured `MARKETPLACE_ID` in the same call. See [SP-API Sellers API reference](https://developer-docs.amazon.com/sp-api/docs/sellers-api-v1-reference#getmarketplaceparticipations).

### Decision 3: Hard-fail (process.exit(1)) on marketplace mismatch

**Why:** The user explicitly chose this. If the configured `MARKETPLACE_ID` is not in the seller's participation list, every tool that takes `marketplaceIds` will 403 at runtime. Failing fast at boot is strictly better than failing late at first tool use, and the user's `.env` is the only place to fix it.

**Alternative considered:** Warn-and-continue. Rejected because the runtime 403 is opaque and the user will waste time debugging.

### Decision 4: Preserve full Amazon error details in failure messages

**Why:** The `SPAPIError` class in `src/client/sp-api-client.ts:12` already captures `statusCode`, `code`, and `details`. The 403 case frequently contains `errors[].details` like `User <X> not enrolled in SP-API` which is the only useful signal for diagnosing app-vs-seller mismatches. Dropping or summarizing loses this.

### Decision 5: Test seams via thin wrapper modules, not by injecting singletons

**Why:** `TokenManager` and `SPAPIClient` are module-level singletons (per AGENTS.md). Tests that need to mock their network behavior would have to mock the `axios` import globally or use `vi.mock` against the singleton module — both brittle. Instead, `validateCredentials()` takes `refreshLwaToken` and `fetchMarketplaceParticipations` as dependency arguments (plain functions). The wrappers in `src/auth/lwa-validator.ts` and `src/client/sellers-api.ts` are 10-15 lines each and exist solely to bind the singletons to the validator's function signature.

**Alternative considered:** Making `TokenManager.refreshToken()` public and passing the manager instance. Rejected because it leaks the seam into the public API of an unrelated class and tempts future callers to bypass the cache.

### Decision 6: Validation runs in `src/index.ts` after `validateConfig()` and before `McpServer` construction

**Why:** We need config available (so `validateConfig()` first), and we must fail before any `McpServer.connect()` call so no MCP client ever observes a half-started server. Placing the call in `index.ts` keeps the validation policy visible at the entry point and avoids having the server class own boot-time network behavior.

**Alternative considered:** A `preflight()` method on `SPAPIClient`. Rejected because the validation is a server-lifecycle concern, not a client capability.

## Risks / Trade-offs

- **[Risk] Startup latency increases by ~200-500ms on a healthy config** (two HTTPS round trips). → **Mitigation**: Acceptable. Validation runs once at boot, not per request. The `TokenManager` cache populated by step 1 saves the refresh on the first real tool call, partially offsetting the cost.
- **[Risk] The boot-time call to `marketplaceParticipations` could itself be rate-limited or 5xx** → **Mitigation**: This call uses the `SPAPIClient`'s `default` rate-limit category (1 rps burst 5). On 5xx, the `SPAPIClient`'s built-in retry logic (3 attempts, exponential backoff) fires before the error reaches the validator. The user sees the eventual Amazon error message verbatim.
- **[Risk] Breaking change for any deployment with a previously-silent misconfiguration** → **Mitigation**: Intentional. The `BREAKING` flag in the proposal.md signals this. The failure message names the exact mismatch, so remediation is one env-var edit.
- **[Risk] `/sellers/v1/marketplaceParticipations` may require a specific IAM role scope not granted to the developer's app** → **Mitigation**: The error from SP-API is surfaced verbatim including `errors[].details`. If the role is missing, the developer sees "role ... not authorized" and can adjust IAM.
- **[Trade-off] We do not validate that any specific tool endpoint is authorized** (e.g., FBA-only tools against a non-FBA seller). This is a deliberate scope limit — a single seller-level probe cannot cover per-tool authorization. Failures here still surface through the existing `SPAPIError` path inside tool handlers.

## Migration Plan

This is a code change with no data migration. Deployment steps:
1. Merge the change to `main`.
2. `pnpm install` (no new deps).
3. `pnpm run typecheck && pnpm run lint && pnpm test` — all green.
4. `pnpm run build` — produces updated `build/index.js`.
5. Existing deployments with **valid** credentials restart transparently and gain a one-line success log.
6. Existing deployments with **invalid** credentials (placeholder env vars, expired refresh tokens, wrong region) will now fail to start with a specific error. Operators fix the env and restart.

**Rollback:** Revert the commit. No state changes, no schema migrations, no persisted data.

## Open Questions

None. The user confirmed all three earlier decisions (hard-fail on mismatch, preserve full Amazon error, log success line) in the planning conversation.
