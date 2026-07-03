## ADDED Requirements

### Requirement: Competitive summary for batched ASINs
The system SHALL expose a tool `get_competitive_summary` that retrieves competitor pricing summary data for up to 20 ASINs by calling `POST /products/pricing/2022-05-01/competitiveSummary` with a body of `{ asins: string[], marketplaceId, includedData: ["featuredBuyingOptions", "referencePrices", "competitivePrices"] }`.

#### Scenario: Single ASIN
- **WHEN** the caller provides a single `asin` (string)
- **THEN** the tool returns that one ASIN's competitive summary including featured offer price, lowest price, buy box price, and number of offers

#### Scenario: Batched up to 20 ASINs
- **WHEN** the caller provides an `asins` array of length between 1 and 20
- **THEN** the tool returns an array of competitive summaries, one per ASIN, in the same order

#### Scenario: Batch limit exceeded
- **WHEN** the caller provides more than 20 ASINs
- **THEN** the tool rejects the call with a clear "max 20 ASINs per request" message before calling Amazon

### Requirement: Featured Offer Expected Price for batched SKUs
The system SHALL expose a tool `get_featured_offer_expected_price_batch` that returns the Featured Offer Expected Price (FOEP) for up to 40 SKUs by calling `POST /products/pricing/2022-05-01/featuredOfferExpectedPriceBatch` with a body of `{ requests: [{ sellerId, marketplaceId, sku, expectedPriceRequests }] }`.

#### Scenario: Single SKU
- **WHEN** the caller provides a single `sku` and a `price`
- **THEN** the tool returns the expected Buy Box price and the conditions under which it applies

#### Scenario: Batched up to 40 SKUs
- **WHEN** the caller provides a `skus` array of length between 1 and 40
- **THEN** the tool returns an array of FOEP results, one per SKU

#### Scenario: Batch limit exceeded
- **WHEN** the caller provides more than 40 SKUs
- **THEN** the tool rejects the call with a clear "max 40 SKUs per request" message before calling Amazon
