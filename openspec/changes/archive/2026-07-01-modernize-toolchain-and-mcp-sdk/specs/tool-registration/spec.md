## ADDED Requirements

### Requirement: Tool registration uses the high-level MCP SDK API

The MCP server SHALL register every tool through `McpServer.registerTool(name, config, handler)` from `@modelcontextprotocol/sdk/server/mcp.js`. The server SHALL be constructed via `new McpServer({ name, version }, { capabilities: { tools: {} } })` and SHALL NOT use the low-level `Server` + `setRequestHandler` pattern.

#### Scenario: Server construction
- **WHEN** the server entry point (`src/index.ts`) starts
- **THEN** it constructs a `McpServer` instance with the package `name` (`amazon-seller-mcp`) and `version` (`1.0.0`) and the `tools` capability enabled
- **AND** it does not import from `@modelcontextprotocol/sdk/server/index.js` (the low-level `Server` class)

#### Scenario: Per-tool registration
- **WHEN** a tool group module (e.g. `src/tools/orders.ts`) is loaded
- **THEN** it exports a function `register<Group>Tools(server: McpServer): void` that calls `server.registerTool(...)` once per tool
- **AND** it does not export a `const xTools: Tool[]` array

#### Scenario: Central registry wires every group
- **WHEN** `src/tools/index.ts` is loaded
- **THEN** it exports `registerAllTools(server: McpServer): void` that calls each group's `register<Group>Tools(server)` exactly once
- **AND** every tool group listed in `proposal.md` (orders, inventory, sales, catalog, finances, reports/{reimbursements,settlements,fees,analytics}) is wired

### Requirement: Each tool's input schema is a zod object

Each `registerTool` call SHALL pass a zod object as the second argument's `inputSchema`. The zod object's `.describe(...)` text SHALL be carried through to the MCP `inputSchema.properties[*].description` so the LLM sees the same prompt text it did before the migration.

#### Scenario: Schema preserved
- **WHEN** a tool's existing zod schema is `z.object({ orderId: z.string().regex(/^\d{3}-\d{7}-\d{7}$/, 'Invalid Amazon order ID format (expected: 111-1234567-1234567)').describe('The Amazon order ID (e.g., 111-1234567-1234567)') })`
- **THEN** the same zod object is passed to `registerTool` unchanged
- **AND** `ListTools` returns the description text in `tools[].inputSchema.properties.orderId.description`

### Requirement: Registration is single-call per tool

The system SHALL NOT maintain a separate runtime array of tool descriptors in addition to the SDK's internal registration. Tool groups SHALL register directly with the server.

#### Scenario: No parallel metadata
- **WHEN** a tool is added in a group module
- **THEN** the only place the tool's name, description, input schema, and handler appear is inside that module's `register<Group>Tools` function
- **AND** no `allTools` array, no `Tool` interface, and no `find(tool => tool.name === name)` lookup exists in `src/tools/index.ts`
