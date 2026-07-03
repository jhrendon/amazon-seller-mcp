# invoice-generation Specification

## Purpose
TBD - created by archiving change add-invoices-fees-feedback-apis. Update Purpose after archive.
## Requirements
### Requirement: List invoices
The system SHALL expose a tool `get_invoices` that lists invoices in a date range, optionally filtered by status, by calling `GET /invoices/v0/invoices?marketplaceId=...&postedAfter=...&postedBefore=...&statuses=...&pageSize=...&nextToken=...`.

#### Scenario: Default listing
- **WHEN** the caller provides a date range and no status filter
- **THEN** the tool returns all invoices in that range (across all statuses) with optional `nextToken` for pagination

#### Scenario: Filtered by status
- **WHEN** the caller provides a `statuses` array (e.g., `["Payable"]`)
- **THEN** the tool returns only invoices matching those statuses

### Requirement: Fetch an invoice document
The system SHALL expose a tool `get_invoice_document` that downloads the PDF for a specific `invoiceId` by calling `GET /invoices/v0/invoices/{invoiceId}/document` to retrieve the presigned URL, then fetching the PDF.

#### Scenario: PDF under 1 MB — embed as base64
- **WHEN** the `Content-Length` of the PDF response is less than 1 MB
- **THEN** the tool returns the base64-encoded PDF in `structuredContent` under `document.base64` and sets `downloaded: true`

#### Scenario: PDF 1 MB or larger — return URL only
- **WHEN** the `Content-Length` of the PDF response is 1 MB or larger
- **THEN** the tool returns the presigned URL in `structuredContent` under `document.url` and sets `downloaded: false`. No base64 is included.

#### Scenario: PDF size not advertised
- **WHEN** the response does not include `Content-Length` (chunked encoding)
- **THEN** the tool streams the response, counts bytes as it goes, and applies the 1 MB threshold during the stream. If the threshold is exceeded, the request is aborted and the URL is returned instead.

### Requirement: Create an invoice
The system SHALL expose a tool `create_invoice` that generates an invoice for a shipment by calling `PUT /fba/inventory/v1/invoices` (Shipment Invoicing API) with a strongly-typed zod payload.

#### Scenario: Valid payload
- **WHEN** the caller provides a `shipmentId`, `invoiceNumber`, `invoiceDate`, and at least one line item
- **THEN** the tool submits the invoice and returns the new `invoiceId` and `invoiceNumber` in the structured response

#### Scenario: Missing required field
- **WHEN** the payload is missing a required field (e.g., `invoiceNumber`)
- **THEN** the zod schema rejects the call with a clear "missing field: invoiceNumber" message before calling Amazon

#### Scenario: Duplicate invoice number
- **WHEN** the `invoiceNumber` is already used for a previous invoice in the same shipment
- **THEN** the tool surfaces Amazon's 409 (or 400 with details) error verbatim

