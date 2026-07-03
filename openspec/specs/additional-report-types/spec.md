## ADDED Requirements

### Requirement: FBA customer returns report
The system SHALL expose `get_fba_customer_returns` that requests `GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA`.

#### Scenario: Fetching returns
- **WHEN** a seller invokes `get_fba_customer_returns` with a date range
- **THEN** the system returns aggregated return data by reason and SKU

### Requirement: FBA inventory planning report
The system SHALL expose `get_fba_inventory_planning` that requests `GET_FBA_INVENTORY_PLANNING_DATA`.

#### Scenario: Fetching planning data
- **WHEN** a seller invokes `get_fba_inventory_planning`
- **THEN** the system returns inventory planning metrics including days of supply and recommended replenishments

### Requirement: Flat-file all-orders report
The system SHALL expose `get_all_orders_report` that requests `GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL`.

#### Scenario: Fetching all orders
- **WHEN** a seller invokes `get_all_orders_report` with a date range
- **THEN** the system returns a comprehensive order dataset

### Requirement: Brand analytics reports
The system SHALL expose `get_market_basket_report` for `GET_BRAND_ANALYTICS_MARKET_BASKET_REPORT` and `get_repeat_purchase_report` for `GET_BRAND_ANALYTICS_REPEAT_PURCHASE_REPORT`.

#### Scenario: Fetching market basket insights
- **WHEN** a seller invokes `get_market_basket_report` with a date range
- **THEN** the system returns products frequently purchased together

### Requirement: Ledger detail report
The system SHALL expose `get_inventory_ledger_detail` that requests `GET_LEDGER_DETAIL_VIEW_DATA`.

#### Scenario: Fetching detailed ledger
- **WHEN** a seller invokes `get_inventory_ledger_detail` with a date range
- **THEN** the system returns detailed inventory ledger transactions
