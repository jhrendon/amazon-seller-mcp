## ADDED Requirements

### Requirement: Transparent retry on HTTP 401
The SP-API client SHALL detect HTTP 401 responses, clear the cached LWA access token, fetch a new token, and retry the failed request exactly once before surfacing the error to the caller.

#### Scenario: Token invalidated mid-session
- **WHEN** an SP-API request returns HTTP 401
- **THEN** the client calls `tokenManager.clearCache()`
- **AND** requests a new access token
- **AND** re-issues the original request with the new token

#### Scenario: Retry also fails
- **WHEN** the retried request after a 401 still returns an error
- **THEN** the client throws an `SPAPIError` with the final status code and does not loop indefinitely

### Requirement: No side effects on non-401 errors
The automatic refresh mechanism SHALL only trigger for HTTP 401 responses and SHALL NOT clear the token cache for 403, 404, 429, or 5xx errors.

#### Scenario: 403 forbidden response
- **WHEN** an SP-API request returns HTTP 403
- **THEN** the client throws an `SPAPIError` immediately
- **AND** the token cache remains unchanged
