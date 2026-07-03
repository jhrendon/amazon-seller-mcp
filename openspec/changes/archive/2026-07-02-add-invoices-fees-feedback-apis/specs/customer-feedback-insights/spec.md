## ADDED Requirements

### Requirement: Get feedback insights for an ASIN
The system SHALL expose a tool `get_feedback_insights_for_asin` that returns rating distribution and theme counts for a single `asin` in a given `marketplaceId` by calling `GET /customerFeedback/2024-06-01/items/{asin}/insights`.

#### Scenario: ASIN has reviews
- **WHEN** the ASIN has at least one review and the seller has Brand Registry
- **THEN** the tool returns the rating distribution (1-5 stars with counts) and the top positive/negative themes

#### Scenario: Brand Registry missing
- **WHEN** the seller does not have Brand Registry for the marketplace
- **THEN** the tool surfaces Amazon's 403 error verbatim. The tool description states the Brand Registry requirement.

#### Scenario: ASIN has no reviews
- **WHEN** the ASIN has zero reviews
- **THEN** the tool returns an empty insights payload (200 with empty arrays) and surfaces a "no feedback available" message

### Requirement: Get feedback insights for a browse node
The system SHALL expose a tool `get_feedback_insights_for_browse_node` that returns aggregated review insights for a category (browse node) in a given `marketplaceId` by calling `GET /customerFeedback/2024-06-01/browseNodes/{browseNodeId}/insights`.

#### Scenario: Browse node has aggregated data
- **WHEN** the browse node exists and the seller has Brand Registry
- **THEN** the tool returns the category-level rating distribution and the top themes across all ASINs in that node
