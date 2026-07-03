## ADDED Requirements

### Requirement: Get a listing by SKU
The system SHALL expose a tool `get_listing` that retrieves the full Listings Item document for a given `sku` in a given `marketplaceId` by calling `GET /listings/2021-08-01/items/{sellerId}/{sku}?marketplaceIds={marketplaceId}&includedData=summaries,attributes,issues,fulfillmentAvailability,purchasableOffer`.

#### Scenario: Successful retrieval
- **WHEN** the caller provides a valid `sku` and `marketplaceId` and the listing exists
- **THEN** the tool returns the full item document including summaries, attributes, issues, fulfillment availability, and purchasable offer in both the `text` and `structuredContent` channels

#### Scenario: Listing does not exist
- **WHEN** the listing is not found
- **THEN** the tool surfaces Amazon's 404 error verbatim with the `statusCode` and `message` from the `SPAPIError`

### Requirement: Search listings
The system SHALL expose a tool `search_listings` that searches the seller's listings by optional filters (`status`, `sku`, `productType`) and supports pagination via `pageToken` with a cap of 20 pages.

#### Scenario: First page of results
- **WHEN** the caller provides a `marketplaceId` and zero or more filters
- **THEN** the tool calls `GET /listings/2021-08-01/items/{sellerId}?marketplaceIds=...&pageToken=...` and returns the items plus an optional `nextToken`

#### Scenario: Following a next page
- **WHEN** the caller provides a `pageToken` returned from a prior call
- **THEN** the tool passes it as the `pageToken` query param and returns the next page

#### Scenario: Pagination cap reached
- **WHEN** the caller has already followed 20 pages and the next response also includes a `nextToken`
- **THEN** the tool stops and returns the items collected so far with a warning that the cap was hit

### Requirement: Create or fully update a listing
The system SHALL expose a tool `put_listing` that creates a new listing or fully replaces an existing one by calling `PUT /listings/2021-08-01/items/{sellerId}/{sku}?marketplaceIds={marketplaceId}` with a typed zod payload containing `productType`, `attributes`, `fulfillmentAvailability`, `purchasableOffer`, `merchantSuggestedAsin` (optional), and `condition` (optional).

#### Scenario: Create succeeds
- **WHEN** the caller provides a valid payload and the SKU does not exist
- **THEN** the tool returns the submitted document and a `submissionId` in the structured response

#### Scenario: Update replaces existing
- **WHEN** the caller provides a valid payload and the SKU already exists
- **THEN** the tool replaces the existing listing and returns the new document and `submissionId`

#### Scenario: Validation failure
- **WHEN** the payload is missing a required field for the given `productType` (e.g., `bullet_point` for a `LUGGAGE` product type)
- **THEN** the tool surfaces Amazon's 400 error including `errors[].details` verbatim

### Requirement: Partially update a listing
The system SHALL expose a tool `patch_listing` that applies a JSON Merge Patch to an existing listing by calling `PATCH /listings/2021-08-01/items/{sellerId}/{sku}?marketplaceIds={marketplaceId}` with only the fields the caller provided (undefined fields are stripped from the request body).

#### Scenario: Patch a subset of fields
- **WHEN** the caller provides `{ attributes: { bullet_point: ["new copy"] } }` only
- **THEN** the request body sent to Amazon contains only `attributes` and the rest of the listing is unchanged

#### Scenario: Patch with no changes
- **WHEN** the caller sends an empty patch object
- **THEN** the tool returns a clear "nothing to update" message without calling Amazon

### Requirement: Delete a listing
The system SHALL expose a tool `delete_listing` that removes a listing by calling `DELETE /listings/2021-08-01/items/{sellerId}/{sku}?marketplaceIds={marketplaceId}`.

#### Scenario: Successful deletion
- **WHEN** the listing exists and the caller confirms the action
- **THEN** the tool returns a 200 status with the deletion confirmation in the structured response

#### Scenario: Listing not found
- **WHEN** the SKU does not exist
- **THEN** the tool surfaces Amazon's 404 error verbatim
