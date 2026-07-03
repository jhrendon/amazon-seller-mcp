## Why

The server's `validateConfig()` only checks that env vars are non-empty strings. It does not verify that the LWA refresh token can be exchanged for an access token, that the access token works against the SP-API, that the configured `SELLER_ID` actually exists, or that the configured `MARKETPLACE_ID` is one the seller participates in. A user with placeholder values in `.env` (or a wrong region, or a revoked refresh token) sees `Connected via stdio transport` and only discovers the problem when the first tool call returns an opaque 401/403. The startup is a lie about readiness.

## What Changes

- Add a new `validateCredentials()` routine that runs at startup, after `validateConfig()`, and before the MCP server connects.
- The routine performs two real network calls:
  1. Exchange the LWA refresh token for an access token via `POST https://api.amazon.com/auth/o2/token`. This populates the `TokenManager` cache for the rest of the session.
  2. `GET /sellers/v1/marketplaceParticipations` against the SP-API to confirm the token is accepted, the seller exists, and enumerate the marketplaces the seller participates in.
- Cross-check the configured `MARKETPLACE_ID` against the seller's participation list. If the configured marketplace is not in the list, the server aborts with `process.exit(1)`.
- Map Amazon's specific error shapes (`invalid_grant`, `invalid_client`, 401, 403, and `errors[].details`) to actionable startup messages instead of opaque 401s.
- On success, log a single line to stderr confirming the seller identity and participating marketplaces before the existing `Connected via stdio transport` banner.

**BREAKING**: Any previously-working deployment with a `.env` containing mismatched seller/marketplace credentials will now refuse to start. This is the intended behavior.

## Capabilities

### New Capabilities
- `startup-credential-validation`: Pre-flight validation of LWA credentials, SP-API access, seller identity, and marketplace participation that runs at server boot and aborts the process with a specific, actionable error message on any failure.

### Modified Capabilities
- None. Existing `tool-registration` and `tool-response-shape` specs are unaffected — the validation runs before tool registration and does not change tool input/output contracts.

## Impact

- **Code**: New module `src/auth/credential-validator.ts` (core logic), new wrappers `src/auth/lwa-validator.ts` and `src/client/sellers-api.ts` (testable seams over existing singletons), type additions to `src/types/sp-api.ts`, modified `src/index.ts` boot sequence.
- **APIs**: No MCP tool surface change. The validation runs before `McpServer.connect()` so it cannot be triggered or observed by MCP clients — it is purely a startup gate.
- **Dependencies**: No new runtime dependencies. Uses existing `axios`, `zod`, and the existing `TokenManager` / `SPAPIClient` singletons.
- **Test surface**: New `tests/credential-validator.test.ts` with mock-injected deps covering happy path, LWA `invalid_grant`, SP-API 401, SP-API 403 (preserving `details`), and marketplace mismatch.
- **Operational**: Server now makes 2 outbound HTTPS calls at startup. Adds ~200-500ms to boot time on a healthy config. A broken config fails fast with a specific error rather than silently starting and failing at first tool use.
