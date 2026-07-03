## ADDED Requirements

### Requirement: Tool handlers return both content and structuredContent

Each tool handler SHALL return an object that includes a `content` array of `{ type: 'text', text: string }` entries and a `structuredContent` object whose value is the parsed payload (the same object that was being `JSON.stringify`-ed into `content[0].text` before this change).

#### Scenario: Successful tool call
- **WHEN** a tool handler completes successfully
- **THEN** the returned object has `content: [{ type: 'text', text: <JSON string of payload> }]`
- **AND** the returned object has `structuredContent: <payload object, not stringified>`

#### Scenario: Failed tool call
- **WHEN** a tool handler throws
- **THEN** the SDK's error wrapping produces a result with `isError: true` and a `content` array whose `text` is `JSON.stringify({ error: <message> }, null, 2)`
- **AND** `structuredContent` is either absent or carries the same `{ error: <message> }` object (SDK-defined behavior is acceptable)

### Requirement: The text channel is preserved

The `content[0].text` string SHALL be `JSON.stringify(payload, null, 2)` so existing MCP clients that only read the text channel see byte-identical output to the pre-migration server.

#### Scenario: Text is unchanged
- **WHEN** any tool handler returns its successful result
- **THEN** `JSON.stringify(result.content[0].text)` (i.e. the text itself) equals `JSON.stringify(JSON.stringify(payload, null, 2))` for the same payload

### Requirement: structuredContent is typed

The `structuredContent` value SHALL be assignable to `Record<string, unknown>` and SHALL be the same in-memory object the handler would have returned as its "summary" before this change. Numeric and boolean fields SHALL be passed as their native types, not as strings.

#### Scenario: Numeric fields are numbers
- **WHEN** a tool returns `totalOrders: allOrders.length` (a `number`)
- **THEN** `structuredContent.totalOrders` is a `number`, not the string `"42"`

#### Scenario: Pagination metadata is included
- **WHEN** a tool fetches paginated results (e.g. `get_orders`)
- **THEN** `structuredContent` includes `totalOrders`, `pagesFetched`, and `hasMore` alongside the `orders` array
