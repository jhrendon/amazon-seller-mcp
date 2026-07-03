## ADDED Requirements

### Requirement: Shared schemas for common inputs
The system SHALL provide reusable Zod schemas for money amounts, Amazon order IDs, date ranges, and marketplace IDs in `src/tools/_shared/schemas.ts`.

#### Scenario: Money schema validation
- **WHEN** a tool receives a price input through the shared money schema
- **THEN** the schema accepts `{ amount: number, currencyCode: string }`
- **AND** it rejects negative amounts or non-string currency codes

#### Scenario: Order ID schema validation
- **WHEN** a tool receives an order ID through the shared order-ID schema
- **THEN** the schema accepts IDs matching `^\d{3}-\d{7}-\d{7}$`
- **AND** it rejects malformed IDs with a descriptive error

### Requirement: Shared response helper
The system SHALL provide `makeToolResponse<T>(payload: T)` in `src/tools/_shared/response.ts` that returns `{ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload }`.

#### Scenario: Successful tool response
- **WHEN** a handler calls `makeToolResponse(summary)`
- **THEN** the returned object has `content[0].text` equal to `JSON.stringify(summary, null, 2)`
- **AND** `structuredContent` is exactly `summary`

### Requirement: Shared marketplace resolver
The system SHALL provide `resolveMarketplaceId(inputMarketplaceId?: string)` in `src/tools/_shared/marketplace.ts` that returns `inputMarketplaceId` when provided and falls back to `config.MARKETPLACE_ID` otherwise.

#### Scenario: Explicit marketplace ID
- **WHEN** a tool receives `marketplaceId: 'A1PA6795UKMFR9'`
- **THEN** the resolver returns `'A1PA6795UKMFR9'`

#### Scenario: Default marketplace ID
- **WHEN** a tool does not receive a `marketplaceId`
- **THEN** the resolver returns the value of `config.MARKETPLACE_ID`
