## ADDED Requirements

### Requirement: Correct long-term storage fee columns
The `get_longterm_storage_fees` tool SHALL map columns according to the official SP-API report schema for `GET_FBA_FULFILLMENT_LONGTERM_STORAGE_FEE_CHARGES_DATA`.

#### Scenario: Parsing a real long-term storage fee report
- **WHEN** the report contains columns such as `snapshot-date`, `sku`, `asin`, `qty-charged`, `amount-charged`, and `surcharge-age-tier`
- **THEN** the tool correctly extracts each row
- **AND** aggregated totals reflect the actual report data

### Requirement: Settlement report preserves transaction rows
The `get_settlement_report` tool SHALL deduplicate rows by a composite key that uniquely identifies each settlement transaction, not by `settlement_id` alone.

#### Scenario: Settlement with multiple transactions
- **WHEN** the settlement report contains multiple rows sharing the same `settlement_id`
- **THEN** every distinct transaction row is retained in the output

### Requirement: Sales summary counts only shipped units
The `get_sales_summary` tool SHALL calculate total units from `NumberOfItemsShipped` only, excluding `NumberOfItemsUnshipped`.

#### Scenario: Order with unshipped items
- **WHEN** a shipped order has `NumberOfItemsShipped: 2` and `NumberOfItemsUnshipped: 1`
- **THEN** `totalUnits` increases by 2, not by 3

### Requirement: Paginated order items
The `get_order_items` tool SHALL iterate through all pages of order items when an order contains more than one page.

#### Scenario: Order with more than 100 items
- **WHEN** an order has 250 items
- **THEN** the tool follows `NextToken` until all items are fetched
- **AND** returns the complete item list

### Requirement: Axios timeout and retry
The SP-API client SHALL configure an explicit request timeout and retry requests aborted due to that timeout.

#### Scenario: Request timeout
- **WHEN** an SP-API request exceeds the configured timeout
- **THEN** axios aborts with `ECONNABORTED`
- **AND** the client retries the request up to the configured retry limit
