## ADDED Requirements

### Requirement: Optional marketplace ID input
Every marketplace-scoped tool SHALL accept an optional `marketplaceId` string in its input schema.

#### Scenario: Querying a non-default marketplace
- **WHEN** a caller invokes `get_sales_metrics` with `marketplaceId: 'A1F83G8C2ARO7P'`
- **THEN** the request targets the UK marketplace instead of the configured default

#### Scenario: Falling back to default marketplace
- **WHEN** a caller invokes `get_sales_metrics` without `marketplaceId`
- **THEN** the request uses the marketplace ID from `config.MARKETPLACE_ID`

### Requirement: Marketplace participation validation
The system SHALL reject `marketplaceId` values that were not present in the seller's validated marketplace participations at startup.

#### Scenario: Invalid marketplace
- **WHEN** a caller provides a marketplace ID where the seller does not participate
- **THEN** the tool throws a validation error before calling SP-API

### Requirement: Backwards compatibility
Existing single-marketplace behavior SHALL remain unchanged when `marketplaceId` is omitted.

#### Scenario: Default behavior preserved
- **WHEN** existing clients call tools without `marketplaceId`
- **THEN** results are identical to the pre-change behavior
