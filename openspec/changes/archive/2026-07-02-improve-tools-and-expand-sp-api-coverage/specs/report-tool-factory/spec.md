## ADDED Requirements

### Requirement: Generic report-tool registration
The system SHALL provide `registerReportTool(name, options)` in `src/tools/reports/_factory.ts` where `options` includes the SP-API report type, input schema, default polling options, CSV parsing options, and a summarize function.

#### Scenario: Registering a report tool
- **WHEN** a developer calls `registerReportTool('get_fba_reimbursements', { reportType: REPORT_TYPES.GET_FBA_REIMBURSEMENTS_DATA, ... })`
- **THEN** the MCP server exposes a tool named `get_fba_reimbursements`
- **AND** the tool accepts the provided input schema

### Requirement: Report-tool lifecycle
Every report tool registered through the factory SHALL perform create report → poll for completion → download document → parse CSV/TSV → summarize results before returning to the caller.

#### Scenario: Successful report generation
- **WHEN** the caller invokes a report tool with valid date parameters
- **THEN** the system creates the report via SP-API
- **AND** polls until the report status is `DONE`
- **AND** downloads and parses the resulting document
- **AND** returns the summarized payload

### Requirement: Consistent error handling for reports
Report tools SHALL translate report statuses `CANCELLED` and `FATAL` into clear, actionable errors and surface any SP-API error details.

#### Scenario: Report fails during processing
- **WHEN** SP-API marks the report as `FATAL`
- **THEN** the tool throws an `SPAPIError` or equivalent error containing the report ID and status
