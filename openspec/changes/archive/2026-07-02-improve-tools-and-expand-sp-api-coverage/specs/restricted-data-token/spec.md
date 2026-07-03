## ADDED Requirements

### Requirement: Create restricted data token
The system SHALL expose `create_restricted_data_token` that calls `POST /tokens/2021-03-01/restrictedDataToken` with a `restrictedResource` array describing target paths and data elements.

#### Scenario: Requesting PII for order addresses
- **WHEN** a seller invokes `create_restricted_data_token` with `targetPath: '/orders/v0/orders'` and `dataElements: ['buyerInfo', 'shippingAddress']`
- **THEN** the system returns a restricted data token and its expiration timestamp

### Requirement: Restricted data token usage
The system SHALL use a restricted data token for the specific SP-API requests declared in its resource list when a tool opts into PII access.

#### Scenario: Fetching order details with PII
- **WHEN** a seller invokes a tool that requires PII with a valid restricted data token
- **THEN** the request uses the restricted token in the `x-amz-access-token` header
- **AND** the response includes the restricted fields

### Requirement: No PII by default
Tools SHALL NOT request or expose PII unless the caller explicitly creates and uses a restricted data token.

#### Scenario: Default order details
- **WHEN** a seller invokes `get_order_details` without a restricted data token
- **THEN** the response contains only non-restricted fields
