## ADDED Requirements

### Requirement: Discover available solicitation actions for an order
The system SHALL expose a tool `get_solicitation_actions_for_order` that returns the list of solicitation types available for a given `orderId` by calling `GET /messaging/v1/orders/{orderId}/solicitation/actions`.

#### Scenario: Returns product review action
- **WHEN** the order is shipped and within the solicitation window
- **THEN** the response includes the `productReviewAndSellerFeedback` action

#### Scenario: Order not eligible
- **WHEN** the order is not yet shipped or outside the solicitation window
- **THEN** the response is an empty actions array and the tool surfaces a clear "no solicitation actions available" message

### Requirement: Request a product review
The system SHALL expose a tool `request_product_review` that requests a product review from a buyer for a given `orderId` by calling `POST /messaging/v1/orders/{orderId}/solicitations/productReviewAndSellerFeedback` with an empty body.

#### Scenario: Order is Shipped
- **WHEN** the caller provides a `orderId` whose order status (fetched via `get_order_details`) is `Shipped`
- **THEN** the tool sends the solicitation to Amazon and returns 200 with the submission confirmation

#### Scenario: Order is not Shipped (client-side guard)
- **WHEN** the caller provides a `orderId` whose order status is anything other than `Shipped`
- **THEN** the tool refuses to call Amazon and returns a clear error "order is in status '<X>' — can only request a review after shipment" without consuming the solicitation quota

#### Scenario: API rejects the solicitation
- **WHEN** the order is in a region or time window that Amazon does not allow
- **THEN** the tool surfaces the 400 error including `errors[].details` verbatim
