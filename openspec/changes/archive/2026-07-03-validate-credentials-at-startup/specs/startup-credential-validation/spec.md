## ADDED Requirements

### Requirement: LWA refresh token validation
The system SHALL exchange the configured LWA refresh token for an access token at server startup by calling `POST https://api.amazon.com/auth/o2/token` with `grant_type=refresh_token` and the configured `LWA_CLIENT_ID` / `LWA_CLIENT_SECRET`.

#### Scenario: Valid LWA credentials
- **WHEN** the LWA refresh token exchange succeeds
- **THEN** the access token is cached in the `TokenManager` and the validator proceeds to the next step

#### Scenario: Invalid LWA credentials
- **WHEN** the LWA refresh token exchange fails with `invalid_grant`, `invalid_client`, or any 4xx response
- **THEN** the server aborts startup with `process.exit(1)` and the error message identifies the LWA step and includes Amazon's `error_description` when available

### Requirement: SP-API seller and marketplace validation
The system SHALL call `GET /sellers/v1/marketplaceParticipations` against the SP-API after a successful LWA exchange, using the access token obtained in the previous step.

#### Scenario: SP-API accepts the access token
- **WHEN** the marketplace participations call returns 200
- **THEN** the validator extracts the list of marketplace IDs where `participation.isParticipating === true` and proceeds to the marketplace cross-check

#### Scenario: SP-API rejects the access token with 401
- **WHEN** the marketplace participations call returns 401
- **THEN** the server aborts startup with `process.exit(1)` and the error message states that LWA accepted the token but the SP-API rejected it, including the original 401 message verbatim

#### Scenario: SP-API rejects with 403 or other authorization error
- **WHEN** the marketplace participations call returns 403
- **THEN** the server aborts startup with `process.exit(1)` and the error message includes the HTTP status, Amazon's error `code`, `message`, and `errors[].details` (when present) verbatim

### Requirement: Configured marketplace participation cross-check
The system SHALL verify that the configured `MARKETPLACE_ID` env var appears in the list of marketplace IDs where the seller is participating, as returned by `/sellers/v1/marketplaceParticipations`.

#### Scenario: Configured marketplace is in the seller's participation list
- **WHEN** the `MARKETPLACE_ID` appears in the participating marketplace IDs
- **THEN** validation succeeds and the server proceeds to start

#### Scenario: Configured marketplace is not in the seller's participation list
- **WHEN** the `MARKETPLACE_ID` does not appear in the participating marketplace IDs
- **THEN** the server aborts startup with `process.exit(1)` and the error message names the configured value and lists the marketplace IDs the seller does participate in

### Requirement: Successful validation log
The system SHALL write a single line to stderr after successful validation, before connecting the MCP transport, summarizing the validated seller and the count and list of participating marketplaces.

#### Scenario: Validation succeeds
- **WHEN** all validation steps pass
- **THEN** the system writes to stderr a message in the form `Validated seller <SELLER_ID> participating in N marketplace(s): [<id1>, <id2>, ...]` containing the configured seller ID and the participating marketplace IDs

### Requirement: Validation ordering and MCP transport gating
The system MUST run LWA + SP-API validation after `validateConfig()` and before constructing the `McpServer` or calling `server.connect(transport)`.

#### Scenario: Validation runs before MCP transport connects
- **WHEN** the server starts
- **THEN** if validation fails, no `McpServer` instance is constructed and no `StdioServerTransport` is connected, ensuring MCP clients never observe a partially-started server
