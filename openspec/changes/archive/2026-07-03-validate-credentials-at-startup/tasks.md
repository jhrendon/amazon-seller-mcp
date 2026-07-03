## 1. Types and contracts

- [x] 1.1 Add `MarketplaceParticipation`, `Participation`, and `GetMarketplaceParticipationsResponse` interfaces to `src/types/sp-api.ts`, mirroring the shape of the existing `GetOrdersResponse` and `Order` types in the same file
- [x] 1.2 Export the new types from `src/types/sp-api.ts` so the validator and tests can import them

## 2. Test seams (thin wrappers over existing singletons)

- [x] 2.1 Create `src/auth/lwa-validator.ts` exporting `refreshLwaTokenForValidation(): Promise<string>` that calls `getTokenManager().getAccessToken()` (which triggers a refresh on cache miss) and returns the token
- [x] 2.2 Create `src/client/sellers-api.ts` exporting `fetchMarketplaceParticipations(): Promise<GetMarketplaceParticipationsResponse>` that calls `getSPAPIClient().get('/sellers/v1/marketplaceParticipations', undefined, { rateLimitCategory: 'default' })`

## 3. Core validator

- [x] 3.1 Create `src/auth/credential-validator.ts` with the `CredentialValidatorDeps`, `ValidationResult` (discriminated union on `ok`), and `validateCredentials(deps)` function signatures exactly as defined in design.md Decision 5
- [x] 3.2 Implement step 1: call `deps.refreshLwaToken()`, catch errors, and map axios/LWA errors to a `{ ok: false, error: 'LWA validation failed: ...' }` result that includes Amazon's `error_description` when present in the axios error response
- [x] 3.3 Implement step 2: call `deps.fetchMarketplaceParticipations()`, catch `SPAPIError`, and on 401/403 return `{ ok: false, error: 'SP-API rejected the access token (HTTP <code>): <message> (<details>)' }` preserving `statusCode`, `code`, `message`, and `details` from the `SPAPIError` instance
- [x] 3.4 Implement step 3: filter the response to marketplace IDs where `participation.isParticipating === true`; if `deps.configuredMarketplaceId` is not in that list, return `{ ok: false, error: 'Configured MARKETPLACE_ID "<X>" is not in this seller\'s participating marketplaces: [<ids>]. Pick one of those.' }`
- [x] 3.5 Implement step 4: on full success, return `{ ok: true, accessToken, participatingMarketplaceIds, configuredMarketplaceValid: true }`

## 4. Boot sequence integration

- [x] 4.1 Modify `src/index.ts` to import `validateCredentials` and the two wrapper functions, and to wrap the existing `validateConfig()` block in an async function that also calls `validateCredentials({ refreshLwaToken, fetchMarketplaceParticipations, configuredMarketplaceId: getConfig().MARKETPLACE_ID, sellerId: getConfig().SELLER_ID })`
- [x] 4.2 On `result.ok === false`, write `Credential validation failed:\n<result.error>` to stderr and call `process.exit(1)`
- [x] 4.3 On success, write `Validated seller <SELLER_ID> participating in N marketplace(s): [<ids>]` to stderr **before** constructing the `McpServer`, and ensure the existing `Connected via stdio transport` banner still appears after `server.connect(transport)`
- [x] 4.4 Verify that on any failure path, `new McpServer(...)` and `server.connect(transport)` are never reached (validation gate enforced by ordering, not by conditional)

## 5. Tests

- [x] 5.1 Create `tests/credential-validator.test.ts` using vitest's `describe` / `it` / `expect` and `vi.fn()` to inject mocked `refreshLwaToken` and `fetchMarketplaceParticipations`
- [x] 5.2 Test happy path: LWA returns a token, SP-API returns 2 participating marketplaces, configured ID is in the list → `result.ok === true` with the expected `accessToken` and `participatingMarketplaceIds`
- [x] 5.3 Test LWA failure: `refreshLwaToken` rejects with an axios-shaped error containing `response.data.error_description = 'Refresh Token has expired'` → `result.ok === false` and `result.error` contains both the string `LWA validation failed` and `Refresh Token has expired`
- [x] 5.4 Test SP-API 401: SP-API rejects with `new SPAPIError('...', 401, 'UNAUTHORIZED', false)` → `result.ok === false` and `result.error` contains `SP-API rejected` and `401`
- [x] 5.5 Test SP-API 403 with details: SP-API rejects with `new SPAPIError('Forbidden', 403, 'FORBIDDEN', false)` and a separately-supplied `details` string of `'User not enrolled'` → `result.ok === false` and `result.error` contains `User not enrolled`
- [x] 5.6 Test marketplace mismatch: SP-API returns 3 participating marketplaces, configured ID is none of them → `result.ok === false` and `result.error` contains both the configured value and all 3 valid IDs
- [x] 5.7 Test participation filter: SP-API returns 2 marketplaces with one having `isParticipating: false` → that ID MUST NOT appear in `result.participatingMarketplaceIds` on the success path

## 6. Verification

- [x] 6.1 Run `pnpm run typecheck` — must pass with no errors
- [x] 6.2 Run `pnpm run lint` — must pass with no warnings
- [x] 6.3 Run `pnpm test` — all new tests pass and the existing `tests/csv-parser.test.ts` still passes
- [ ] 6.4 Manual smoke test with valid `.env`: `pnpm run dev` shows the new `Validated seller ...` line followed by the existing `Connected via stdio transport` banner
- [ ] 6.5 Manual smoke test with an obviously-wrong `LWA_REFRESH_TOKEN` (e.g., set it to `INVALID`): `pnpm run dev` exits with a non-zero status and the stderr message identifies the LWA step
- [ ] 6.6 Manual smoke test with a valid LWA token but a `MARKETPLACE_ID` that is not in the seller's participation list (e.g., US marketplace ID for a seller that only sells in EU): `pnpm run dev` exits with a non-zero status and the stderr message lists the actual valid marketplaces
