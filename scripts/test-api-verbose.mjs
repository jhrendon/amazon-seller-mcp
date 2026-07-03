import { getSPAPIClient } from '../build/client/sp-api-client.js';
import { getConfig } from '../build/config/index.js';

async function testAPIs() {
  try {
    const client = getSPAPIClient();
    const config = getConfig();

    console.log('Testing APIs with Marketplace:', config.MARKETPLACE_ID);
    console.log('Seller ID:', config.SELLER_ID);
    console.log('');

    // Test Inventory API with full error details
    console.log('Testing Inventory API (FBA) with full error...');
    try {
      const inventoryResponse = await client.get('/fba/inventory/v1/summaries', {
        granularityType: 'Marketplace',
        granularityId: config.MARKETPLACE_ID,
        marketplaceIds: config.MARKETPLACE_ID
      }, { rateLimitCategory: 'inventory' });
      console.log('✅ Inventory API: SUCCESS');
      console.log(JSON.stringify(inventoryResponse, null, 2));
    } catch (e) {
      console.log('❌ Inventory API: FAILED');
      console.log('Error:', e.message);
      if (e.response) {
        console.log('Status:', e.response.status);
        console.log('Response:', JSON.stringify(e.response.data, null, 2));
      }
    }

    console.log('');

    // Test Sales API with full error details
    console.log('Testing Sales API with full error...');
    try {
      const salesResponse = await client.get('/sales/v1/orderMetrics', {
        marketplaceIds: config.MARKETPLACE_ID,
        interval: '2025-01-01T00:00:00Z--2025-01-31T23:59:59Z',
        granularity: 'Total'
      }, { rateLimitCategory: 'sales' });
      console.log('✅ Sales API: SUCCESS');
      console.log(JSON.stringify(salesResponse, null, 2));
    } catch (e) {
      console.log('❌ Sales API: FAILED');
      console.log('Error:', e.message);
      if (e.response) {
        console.log('Status:', e.response.status);
        console.log('Response:', JSON.stringify(e.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAPIs();
