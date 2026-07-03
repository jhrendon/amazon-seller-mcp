## ADDED Requirements

### Requirement: List inbound plans
The system SHALL expose `list_inbound_plans` that calls `GET /inbound/fba/2024-03-20/inboundPlans` and returns plans with pagination support.

#### Scenario: Listing plans
- **WHEN** a seller invokes `list_inbound_plans`
- **THEN** the system returns inbound plans including `inboundPlanId`, `name`, `status`, and `createdAt`

### Requirement: Get inbound plan details
The system SHALL expose `get_inbound_plan` that calls `GET /inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}`.

#### Scenario: Fetching plan details
- **WHEN** a seller invokes `get_inbound_plan` with a valid `inboundPlanId`
- **THEN** the system returns the full plan details including shipments and placement options

### Requirement: Create inbound plan
The system SHALL expose `create_inbound_plan` that calls `POST /inbound/fba/2024-03-20/inboundPlans`.

#### Scenario: Creating a plan
- **WHEN** a seller provides `marketplaceId`, `originAddress`, and `items`
- **THEN** the system creates the inbound plan and returns the new `inboundPlanId`

### Requirement: List shipments for a plan
The system SHALL expose `list_inbound_plan_shipments` that calls `GET /inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments`.

#### Scenario: Listing shipments
- **WHEN** a seller invokes `list_inbound_plan_shipments` with a valid plan ID
- **THEN** the system returns the shipment list for that plan

### Requirement: Get shipment details
The system SHALL expose `get_inbound_shipment` that calls `GET /inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}`.

#### Scenario: Fetching shipment details
- **WHEN** a seller invokes `get_inbound_shipment` with valid IDs
- **THEN** the system returns the shipment details including boxes, items, and status
