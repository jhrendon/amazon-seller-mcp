# Amazon SP-API MCP Server

A Model Context Protocol (MCP) server that connects Claude to Amazon Seller Central via the SP-API. Enables natural language queries for sales data, inventory, catalog, finances, reports, fees, reimbursements, and analytics.

> **Security Notice (March 31, 2026):** The `axios` npm package was briefly compromised in a supply chain attack. Malicious versions `1.14.1` and `0.30.4` were published between 00:21 and 03:15 UTC on March 31 before npm removed them. These versions contained a trojanized dependency (`plain-crypto-js`) that installed a remote access trojan. **This repo's axios dependency has been pinned to `1.14.0` (the last clean version).** If you ran `npm install` during the attack window, delete your `node_modules` folder and reinstall. See: [Snyk advisory](https://snyk.io/blog/axios-npm-package-compromised-supply-chain-attack-delivers-cross-platform/), [Datadog analysis](https://securitylabs.datadoghq.com/articles/axios-npm-supply-chain-compromise/).

## Key Feature: No AWS Credentials Required

As of October 2023, Amazon SP-API no longer requires AWS IAM credentials. This server uses **LWA (Login with Amazon) OAuth 2.0 only**, making setup simpler and more secure.

## Features

### Core Operations
- **Orders**: List orders, retrieve order details, and fetch line items
- **Inventory**: FBA inventory summary and detailed health metrics (reserved / unfulfillable)
- **Sales**: Sales metrics by day/week/month plus a cross-period summary
- **Catalog**: Look up individual ASINs and search the catalog (2022-04-01 API)
- **Listings**: Full CRUD on product listings — create, read, update (full / partial), delete

### Financial Data
- **Reimbursements**: FBA reimbursements for lost/damaged inventory
- **Settlements**: Payment disbursement details and breakdowns
- **Fee Estimates**: Per-SKU FBA fee estimates
- **Storage Fees**: Monthly storage charges
- **Long-term Storage Fees**: LTSF for aged inventory (365+ days)
- **Finances API**: Financial events, financial event groups, and per-order financial events for reconciliation
- **Live Fees**: Real-time FBA fee estimates by ASIN or SKU with shipping speed
- **Invoices**: List, fetch (PDF with 1 MB embed threshold), and create shipment invoices

### Analytics
- **Sales & Traffic**: Sessions, page views, conversion rates, buy box %
- **Search Terms**: Brand Analytics search term performance (requires Brand Registry)
- **Market Basket**: Brand Analytics market basket report (frequently bought together)
- **Repeat Purchase**: Brand Analytics repeat purchase behavior report
- **Inventory Ledger**: Track inventory movements and adjustments (summary and detail views)
- **Customer Feedback**: Item-level and browse-node-level review insights (requires Brand Registry)
- **Pricing Intelligence**: Competitive summaries (price, buy box, number of offers) and Featured Offer Expected Price for repricers
- **Buyer Solicitation**: Discover available solicitation actions and request a product review from a buyer for a delivered order

### New API Domains
- **FBA Inbound v2024-03-20**: List/create inbound plans and list/get inbound shipments
- **Restricted Data Token**: Create RDTs for PII access (e.g., buyer addresses) and use them with order details
- **Merchant Fulfillment v0**: Eligible shipping services, create/get/cancel merchant-fulfilled shipments
- **Data Kiosk 2023-11-15**: Create, poll, and list Data Kiosk queries; download completed result documents

### Reliability
- **Startup credential validation** — the server exchanges the LWA refresh token and calls `/sellers/v1/marketplaceParticipations` **before** the MCP transport connects. A misconfigured `SELLER_ID`, an expired refresh token, or a `MARKETPLACE_ID` the seller does not participate in causes the server to refuse to start with a specific error, rather than failing opaquely on the first tool call.
- **Multi-marketplace support** — every marketplace-scoped tool accepts an optional `marketplaceId` input. When omitted the configured `MARKETPLACE_ID` is used; when provided it is validated against the seller's participating marketplaces at startup.
- **Automatic token refresh on HTTP 401** — if Amazon invalidates the cached access token mid-session, the client clears the cache, fetches a new token, and retries the request once.
- **Explicit request timeout + retry** — axios requests time out after 30 seconds and are retried on `ECONNABORTED`.
- **Per-category rate limiting** with exponential-backoff retry on retryable Amazon errors (429 / 5xx / network)
- **Structured `SPAPIError`** with `statusCode`, `code`, and a `details` field captured from Amazon's `errors[].details` for actionable error messages

## Prerequisites

- Node.js 18+
- Amazon Seller Central account
- SP-API application registered in Developer Central
- LWA credentials (Client ID, Client Secret, Refresh Token)

## Installation

This project uses pnpm. If you have Corepack enabled, no setup is needed; otherwise run `npm i -g pnpm` first.

```bash
git clone https://github.com/jhrendon/amazon-seller-mcp.git
cd amazon-seller-mcp
pnpm install
pnpm run build
```

## Configuration

Create a `.env` file with your credentials:

```bash
cp .env.example .env
```

Required environment variables:

```bash
# Login with Amazon (LWA) OAuth 2.0 Credentials
LWA_CLIENT_ID=amzn1.application-oa2-client.xxxxx
LWA_CLIENT_SECRET=your_lwa_client_secret
LWA_REFRESH_TOKEN=Atzr|your_refresh_token

# Seller Information
SELLER_ID=your_seller_id
MARKETPLACE_ID=ATVPDKIKX0DER

# SP-API Endpoint (optional, defaults to North America)
SP_API_ENDPOINT=https://sellingpartnerapi-na.amazon.com
```

> **Note on `MARKETPLACE_ID`:** at startup the server calls Amazon's `getMarketplaceParticipations` and confirms your `MARKETPLACE_ID` is one the seller actually participates in. Using a region where the seller is not enrolled (e.g. `ATVPDKIKX0DER` for a seller that only sells in EU) will cause the server to refuse to start and list the valid marketplaces in the error message.

### Marketplace IDs

| Region | Marketplace | ID |
|--------|-------------|-----|
| US | Amazon.com | ATVPDKIKX0DER |
| CA | Amazon.ca | A2EUQ1WTGCTBG2 |
| MX | Amazon.com.mx | A1AM78C64UM0Y8 |
| UK | Amazon.co.uk | A1F83G8C2ARO7P |
| DE | Amazon.de | A1PA6795UKMFR9 |
| JP | Amazon.co.jp | A1VC38T7YXB528 |

### SP-API Endpoints

| Region | Endpoint |
|--------|----------|
| North America | https://sellingpartnerapi-na.amazon.com |
| Europe | https://sellingpartnerapi-eu.amazon.com |
| Far East | https://sellingpartnerapi-fe.amazon.com |

## Startup Validation

Every time the server starts it performs two real network checks before the MCP transport connects:

1. **LWA refresh-token exchange** against `https://api.amazon.com/auth/o2/token`. The resulting access token is cached in the `TokenManager` so the first tool call does not pay the refresh cost again.
2. **`GET /sellers/v1/marketplaceParticipations`** against the SP-API. Confirms the access token is accepted, the seller exists, and enumerates the marketplaces the seller participates in.

If either step fails the server aborts with `process.exit(1)` and writes a specific error to stderr naming the failing dimension. For example:

```
Credential validation failed:
LWA validation failed: Refresh Token has expired (invalid_grant)
```

```
Credential validation failed:
Configured MARKETPLACE_ID "ATVPDKIKX0DER" is not in this seller's participating
marketplaces: [A1F83G8C2ARO7P, A1PA6795UKMFR9, A13V1IB3VIYBER]. Pick one of those.
```

On success you see a confirmation line before the `Connected via stdio transport` banner:

```
Validated seller A1B2C3D4E5 participating in 2 marketplace(s): [ATVPDKIKX0DER, A2EUQ1WTGCTBG2]
amazon-seller-mcp v1.0.0 running
Connected via stdio transport
```

> **Breaking change:** any deployment that previously started silently with invalid credentials (e.g. placeholder values in `.env`, an expired refresh token, or a `MARKETPLACE_ID` for the wrong region) will now refuse to start. The error message names exactly what is wrong so the fix is a one-line edit to `.env`.

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "amazon-seller": {
      "command": "node",
      "args": ["/path/to/amazon-seller-mcp/build/index.js"],
      "env": {
        "LWA_CLIENT_ID": "amzn1.application-oa2-client.xxxxx",
        "LWA_CLIENT_SECRET": "your_secret",
        "LWA_REFRESH_TOKEN": "Atzr|your_token",
        "SELLER_ID": "your_seller_id",
        "MARKETPLACE_ID": "ATVPDKIKX0DER",
        "SP_API_ENDPOINT": "https://sellingpartnerapi-na.amazon.com"
      }
    }
  }
}
```

Restart Claude Desktop after making changes.

## Usage with Claude Code

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "amazon-seller": {
      "command": "node",
      "args": ["./build/index.js"],
      "env": {
        "LWA_CLIENT_ID": "${LWA_CLIENT_ID}",
        "LWA_CLIENT_SECRET": "${LWA_CLIENT_SECRET}",
        "LWA_REFRESH_TOKEN": "${LWA_REFRESH_TOKEN}",
        "SELLER_ID": "${SELLER_ID}",
        "MARKETPLACE_ID": "${MARKETPLACE_ID}",
        "SP_API_ENDPOINT": "${SP_API_ENDPOINT}"
      }
    }
  }
}
```

## Available Tools

Most marketplace-scoped tools accept an optional `marketplaceId` parameter. When omitted, the configured `MARKETPLACE_ID` is used; when provided, it is validated against the seller's participating marketplaces.

### Orders
| Tool | Description |
|------|-------------|
| `get_orders` | List orders by date range, status, fulfillment channel |
| `get_order_details` | Get details for a specific order. Optional `restrictedDataToken` enables PII fields |
| `get_order_items` | Get line items for an order (paginated)

### Inventory
| Tool | Description |
|------|-------------|
| `get_inventory_summary` | FBA inventory levels and health |
| `get_fba_inventory_details` | Detailed breakdown of reserved / unfulfillable quantities |

### Sales
| Tool | Description |
|------|-------------|
| `get_sales_metrics` | Sales aggregates by day/week/month |
| `get_sales_summary` | Cross-period sales summary |

### Catalog
| Tool | Description |
|------|-------------|
| `get_catalog_item` | Fetch a single ASIN from the catalog (2022-04-01) |
| `search_catalog` | Search the catalog by keywords, brand, or category |

### Listings
| Tool | Description |
|------|-------------|
| `get_listing` | Retrieve the full listing document for a SKU in a marketplace (summaries, attributes, fulfillment availability, purchasable offer, issues) |
| `search_listings` | Search listings by status / sku / productType with paginated results |
| `put_listing` | Create or fully replace a listing. **Destructive** — use `search_listings` → `get_listing` first to know the current state |
| `patch_listing` | Apply a partial update (JSON Merge Patch) — only the fields you provide are changed |
| `delete_listing` | Delete a listing. **Permanent and irreversible** |

### Pricing
| Tool | Description |
|------|-------------|
| `get_competitive_summary` | Competitive pricing (featured offer, lowest, buy box, number of offers) for one ASIN or up to 20 ASINs |
| `get_featured_offer_expected_price_batch` | Featured Offer Expected Price (FOEP) for one SKU or up to 40 SKUs at a given price |

### Solicitations
| Tool | Description |
|------|-------------|
| `get_solicitation_actions_for_order` | Discover which buyer solicitation actions are available for an order |
| `request_product_review` | Request a product review from a buyer for a delivered order. Validates `Shipped` status client-side first |

### Financial Reports
| Tool | Description |
|------|-------------|
| `get_fba_reimbursements` | Lost / damaged inventory reimbursements |
| `get_settlement_report` | Payment disbursement details |
| `get_fba_fee_estimates` | Per-SKU fee breakdown |
| `get_storage_fees` | Monthly storage charges |
| `get_longterm_storage_fees` | LTSF for aged inventory (365+ days) |
| `get_fba_customer_returns` | FBA customer returns data |
| `get_fba_inventory_planning` | Inventory planning metrics (days of supply, recommended replenishments) |
| `get_all_orders_report` | Flat-file all-orders report by order date |

### Finances API
| Tool | Description |
|------|-------------|
| `get_financial_events` | All financial events for a date range (sales, refunds, fees, reimbursements, adjustments) |
| `get_financial_event_groups` | Grouped financial events / payment disbursements |
| `get_order_financial_events` | Financial events scoped to a specific order |

### Invoices
| Tool | Description |
|------|-------------|
| `get_invoices` | List shipment invoices in a date range, optionally filtered by status |
| `get_invoice_document` | Download a shipment invoice PDF. PDFs under 1 MB are embedded as base64; larger ones return only the presigned URL |
| `create_invoice` | Generate a shipment invoice. **Permanent and may have tax implications** — verify shipment id, invoice number uniqueness, and line items before submitting |

### Live Fees
| Tool | Description |
|------|-------------|
| `get_fees_estimate_for_asin` | Compute FBA fee estimates in real time for one ASIN or up to 20 ASINs |
| `get_fees_estimate_for_sku` | Compute FBA fee estimate for a single SKU with `shippingSpeed` (Standard / Expedited / Priority) |

> The report-based `get_fba_fee_estimates`, `get_storage_fees`, and `get_longterm_storage_fees` (in "Fee Reports" above) are better for batch historical analysis. Use the Live Fees tools for repricing and interactive queries.

### Customer Feedback
| Tool | Description |
|------|-------------|
| `get_feedback_insights_for_asin` | Rating distribution and theme counts for one ASIN (requires Brand Registry) |
| `get_feedback_insights_for_browse_node` | Aggregated review insights for a category |

### FBA Inbound
| Tool | Description |
|------|-------------|
| `list_inbound_plans` | List inbound plans with pagination |
| `get_inbound_plan` | Get details for a specific inbound plan |
| `create_inbound_plan` | Create a new inbound plan |
| `list_inbound_plan_shipments` | List shipments for an inbound plan |
| `get_inbound_shipment` | Get details for a specific inbound shipment |

### Restricted Data Token
| Tool | Description |
|------|-------------|
| `create_restricted_data_token` | Create a Restricted Data Token for PII access |

### Merchant Fulfillment
| Tool | Description |
|------|-------------|
| `get_eligible_shipping_services` | List eligible shipping services for a shipment |
| `create_shipment` | Create a merchant-fulfilled shipment and purchase a label |
| `get_shipment` | Get shipment status, tracking, and label URL |
| `cancel_shipment` | Cancel a merchant-fulfilled shipment |

### Data Kiosk
| Tool | Description |
|------|-------------|
| `create_data_kiosk_query` | Create a Data Kiosk query (GraphQL) |
| `get_data_kiosk_query` | Poll query status and download the result when `DONE` |
| `list_data_kiosk_queries` | List recent Data Kiosk queries |

## Example Queries

Once configured, you can ask Claude questions like:

- "What were my sales last week?"
- "Show me my FBA reimbursements for January"
- "What's my current inventory health?"
- "Pull my settlement report for the last payment"
- "What are my storage fees by SKU?"
- "Which products have the best conversion rate?"
- "Show me my long-term storage fees"
- "Look up catalog item B08N5WRWNW"
- "Search the catalog for wireless earbuds under $50"
- "List my financial event groups for the last 30 days"
- "Show me the financial events for order 111-2222222-3333333"
- "What are the FBA fees for ASIN B08N5WRWNW at $24.99?"
- "List all Payable invoices posted after 2025-01-01"
- "Download the PDF for invoice INV-2025-001"
- "Generate an invoice for shipment SHP-123 with two line items"
- "What is the rating distribution and top complaint theme for ASIN B08N5WRWNW?"
- "Look up the listing for SKU WIDGET-001 in the US marketplace"
- "Patch the listing for SKU WIDGET-001: change the bullet points to the new copy"
- "What's the lowest competing price for ASIN B08N5WRWNW?"
- "What price would win the Buy Box for SKU WIDGET-001 at $24.99?"
- "Request a product review from the buyer of order 111-2222222-3333333"

## Development

```bash
# Build
pnpm run build

# Run in development mode
pnpm run dev

# Type-check without emitting
pnpm run typecheck

# Run tests
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Lint
pnpm run lint

# Format
pnpm run format
```

### Tests

Tests live in `tests/` and run with Vitest. The suite now covers the CSV parser, credential validator, token manager, rate limiter, report poller, SP-API client, report factory, and all major tool groups. The 80% global coverage threshold in `vitest.config.ts` is aspirational — `pnpm run test:coverage` will still fail it until the report-tool handlers and a few utility modules have dedicated tests, but the critical path is well covered.

## Architecture

```
src/
├── index.ts                       # MCP server entry point (validation → connect)
├── config/
│   └── index.ts                   # Configuration & zod validation
├── auth/
│   ├── token-manager.ts           # LWA OAuth 2.0 token management (cached, 5-min buffer)
│   ├── lwa-validator.ts           # Test seam over the token manager for boot-time validation
│   ├── credential-validator.ts    # Startup LWA + SP-API marketplace participation check
│   └── restricted-token.ts        # Restricted Data Token creation
├── client/
│   ├── sp-api-client.ts           # Axios client, SPAPIError, retry/backoff
│   ├── rate-limiter.ts            # Token-bucket rate limiter per endpoint category
│   └── sellers-api.ts             # Test seam over the SP-API client for /marketplaceParticipations
├── tools/
│   ├── index.ts                   # Tool registry
│   ├── _shared/                   # Shared schemas, response helper, marketplace resolver
│   │   ├── schemas.ts
│   │   ├── response.ts
│   │   └── marketplace.ts
│   ├── orders.ts                  # Orders API tools
│   ├── inventory.ts               # Inventory API tools
│   ├── sales.ts                   # Sales API tools
│   ├── catalog.ts                 # Catalog API tools
│   ├── finances.ts                # Finances API tools
│   ├── invoices.ts                # Invoices API tools
│   ├── fees.ts                    # Live Product Fees API tools
│   ├── feedback.ts                # Customer Feedback API tools
│   ├── listings.ts                # Listings Items API tools
│   ├── pricing.ts                 # Product Pricing API tools
│   ├── solicitations.ts           # Solicitations API tools
│   ├── fba-inbound.ts             # FBA Inbound v2024-03-20 tools
│   ├── merchant-fulfillment.ts    # Merchant Fulfillment v0 tools
│   ├── data-kiosk.ts              # Data Kiosk 2023-11-15 tools
│   ├── tokens.ts                  # Restricted Data Token tool
│   └── reports/
│       ├── index.ts
│       ├── _factory.ts            # Generic factory for report-based tools
│       ├── additional-reports.ts  # Customer returns, inventory planning, all orders, etc.
│       ├── reimbursements.ts      # FBA reimbursements
│       ├── settlements.ts         # Settlement reports
│       ├── fees.ts                # Fee reports
│       └── analytics.ts           # Brand analytics
├── types/
│   └── sp-api.ts                  # TypeScript definitions
└── utils/
    ├── csv-parser.ts              # Report CSV parsing
    └── report-poller.ts           # Async report polling

tests/
├── csv-parser.test.ts             # CSV / TSV parsing utilities
├── credential-validator.test.ts   # Startup validation logic (mocked deps)
├── data-kiosk.test.ts             # Data Kiosk query lifecycle
├── fba-inbound.test.ts            # FBA Inbound plans and shipments
├── feedback.test.ts               # Customer feedback tool + Brand Registry 403
├── fees.test.ts                   # Live fees tool + shipping speed + batch limit
├── finances.test.ts               # Finances API tools
├── inventory.test.ts              # FBA inventory summary and details
├── invoices.test.ts               # Invoices tool + 1 MB PDF threshold
├── listings.test.ts               # Listings tool + patch strip-undefined logic
├── marketplace.test.ts            # Marketplace resolution and validation
├── merchant-fulfillment.test.ts   # Merchant fulfillment tools
├── orders.test.ts                 # Orders API tools + pagination
├── pricing.test.ts                # Pricing tool + ASIN/SKU batch limits
├── rate-limiter.test.ts           # Token-bucket rate limiter
├── report-poller.test.ts          # Async report polling and download
├── reports-factory.test.ts        # Generic report-tool factory
├── restricted-token.test.ts       # Restricted Data Token creation
├── sales.test.ts                  # Sales API tools
├── solicitations.test.ts          # Solicitations tool + Shipped-status guard
├── sp-api-client.test.ts          # Axios client retries and SPAPIError details
├── token-manager.test.ts          # LWA token cache and refresh deduplication
└── tokens.test.ts                 # Restricted Data Token tool
```

## License

MIT

## Resources

- [Amazon SP-API Documentation](https://developer-docs.amazon.com/sp-api/)
- [SP-API Report Types](https://developer-docs.amazon.com/sp-api/docs/report-type-values)
- [Sellers API Reference](https://developer-docs.amazon.com/sp-api/docs/sellers-api-v1-reference)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [SP-API No Longer Requires AWS Credentials](https://developer-docs.amazon.com/sp-api/changelog/sp-api-will-no-longer-require-aws-iam-or-aws-signature-version-4)
