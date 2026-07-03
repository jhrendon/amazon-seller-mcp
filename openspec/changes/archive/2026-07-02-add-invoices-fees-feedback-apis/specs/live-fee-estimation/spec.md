## ADDED Requirements

### Requirement: Get fees estimate for ASIN(s)
The system SHALL expose a tool `get_fees_estimate_for_asin` that returns FBA fee estimates for one or up to 20 ASINs by calling `POST /products/fees/v0/feesEstimate` with `{ asin, marketplaceId, price }` for each ASIN.

#### Scenario: Single ASIN
- **WHEN** the caller provides a single `asin` (string) and a `price`
- **THEN** the tool returns the `FeesEstimateResult` with `TotalFeesEstimate` and `FeeDetail[]`

#### Scenario: Batched up to 20 ASINs
- **WHEN** the caller provides an `asins` array of length between 1 and 20
- **THEN** the tool loops internally and returns an array of `FeesEstimateResult`, one per ASIN

#### Scenario: Batch limit exceeded
- **WHEN** the caller provides more than 20 ASINs
- **THEN** the tool rejects the call with a clear "max 20 ASINs per request" message before calling Amazon

### Requirement: Get fees estimate for a SKU
The system SHALL expose a tool `get_fees_estimate_for_sku` that returns FBA fee estimates for a single `sku` with an explicit `shippingSpeed` (default `Standard`) by calling `POST /products/fees/v0/feesEstimate` with `{ sku, marketplaceId, price, shippingSpeed }`.

#### Scenario: Standard shipping (default)
- **WHEN** the caller provides a `sku` and `price` without specifying `shippingSpeed`
- **THEN** the tool uses `Standard` and returns the corresponding fee estimate

#### Scenario: Expedited or Priority
- **WHEN** the caller provides `shippingSpeed: "Expedited"` or `"Priority"`
- **THEN** the tool passes the value through to Amazon and returns the corresponding fee estimate
