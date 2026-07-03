## ADDED Requirements

### Requirement: Create Data Kiosk query
The system SHALL expose `create_data_kiosk_query` that calls `POST /dataKiosk/2023-11-15/queries` with a GraphQL query document.

#### Scenario: Creating a sales-and-traffic query
- **WHEN** a seller invokes `create_data_kiosk_query` with a supported query document
- **THEN** the system returns a `queryId` and the initial processing status

### Requirement: Get Data Kiosk query
The system SHALL expose `get_data_kiosk_query` that calls `GET /dataKiosk/2023-11-15/queries/{queryId}`.

#### Scenario: Polling query status
- **WHEN** a seller invokes `get_data_kiosk_query` with a valid `queryId`
- **THEN** the system returns the query status and, when done, the document URL

### Requirement: List Data Kiosk queries
The system SHALL expose `list_data_kiosk_queries` that calls `GET /dataKiosk/2023-11-15/queries` with pagination.

#### Scenario: Listing recent queries
- **WHEN** a seller invokes `list_data_kiosk_queries`
- **THEN** the system returns previously created queries with status and creation date

### Requirement: Document download
When a Data Kiosk query reaches `DONE` status, the system SHALL download and parse the resulting document using the existing report-poller utilities.

#### Scenario: Query completes
- **WHEN** a query status is `DONE`
- **THEN** the system downloads the document from the provided URL
- **AND** returns the parsed payload
