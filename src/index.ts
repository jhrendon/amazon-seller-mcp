#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { validateConfig, getConfig } from './config/index.js';
import { validateCredentials } from './auth/credential-validator.js';
import { refreshLwaTokenForValidation } from './auth/lwa-validator.js';
import { fetchMarketplaceParticipations } from './client/sellers-api.js';
import { registerAllTools } from './tools/index.js';
import { setParticipatingMarketplaceIds } from './tools/_shared/marketplace.js';

const SERVER_NAME = 'amazon-seller-mcp';
const SERVER_VERSION = '1.0.0';

async function main() {
  // Validate configuration on startup
  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Validate LWA credentials, seller identity, and marketplace participation
  // against Amazon BEFORE the MCP transport connects. If anything is wrong,
  // we abort with a specific error rather than starting a server that will
  // fail on the first tool call.
  let validationResult;
  try {
    const config = getConfig();
    validationResult = await validateCredentials({
      refreshLwaToken: refreshLwaTokenForValidation,
      fetchMarketplaceParticipations,
      configuredMarketplaceId: config.MARKETPLACE_ID,
      sellerId: config.SELLER_ID,
    });
  } catch (error) {
    console.error('Credential validation failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!validationResult.ok) {
    console.error('Credential validation failed:');
    console.error(validationResult.error);
    process.exit(1);
  }

  console.error(
    `Validated seller ${getConfig().SELLER_ID} ` +
      `participating in ${validationResult.participatingMarketplaceIds.length} ` +
      `marketplace(s): [${validationResult.participatingMarketplaceIds.join(', ')}]`
  );

  // Create MCP server
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Store validated marketplace participations so tools can validate per-request marketplace IDs
  setParticipatingMarketplaceIds(validationResult.participatingMarketplaceIds);

  // Register all tools
  registerAllTools(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} running`);
  console.error('Connected via stdio transport');
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
