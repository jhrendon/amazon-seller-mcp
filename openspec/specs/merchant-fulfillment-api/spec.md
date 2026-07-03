## ADDED Requirements

### Requirement: List eligible shipping services
The system SHALL expose `get_eligible_shipping_services` that calls `POST /mfn/v0/eligibleShippingServices`.

#### Scenario: Finding services for an order
- **WHEN** a seller invokes `get_eligible_shipping_services` with shipment details
- **THEN** the system returns a list of available shipping services with rates and delivery promises

### Requirement: Create merchant fulfillment shipment
The system SHALL expose `create_shipment` that calls `POST /mfn/v0/shipments`.

#### Scenario: Purchasing a shipping label
- **WHEN** a seller selects a shipping service and provides package details
- **THEN** the system creates the shipment and returns the label URL, tracking ID, and shipment ID

### Requirement: Get shipment details
The system SHALL expose `get_shipment` that calls `GET /mfn/v0/shipments/{shipmentId}`.

#### Scenario: Tracking a shipment
- **WHEN** a seller invokes `get_shipment` with a valid `shipmentId`
- **THEN** the system returns shipment status, tracking ID, and label information

### Requirement: Cancel shipment
The system SHALL expose `cancel_shipment` that calls `DELETE /mfn/v0/shipments/{shipmentId}`.

#### Scenario: Cancelling before label print
- **WHEN** a seller invokes `cancel_shipment` with a valid `shipmentId`
- **THEN** the system cancels the shipment and confirms cancellation
