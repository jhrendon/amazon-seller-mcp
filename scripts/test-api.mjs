import { getSPAPIClient } from '../build/client/sp-api-client.js';
import { getConfig } from '../build/config/index.js';

async function testAPIs() {
  try {
    const client = getSPAPIClient();
    const config = getConfig();

    console.log('Testing APIs with Marketplace:', config.MARKETPLACE_ID);
    console.log('Seller ID:', config.SELLER_ID);
    console.log('');

    // Test 1: Orders API
    console.log('1. Testing Orders API...');
    try {
      const ordersResponse = await client.get('/orders/v0/orders', {
        MarketplaceIds: config.MARKETPLACE_ID,
        CreatedAfter: '2025-02-01T00:00:00Z',
        MaxResultsPerPage: 5
      }, { rateLimitCategory: 'orders' });
      console.log('   ✅ Orders API: SUCCESS - Found', ordersResponse.payload?.Orders?.length || 0, 'orders');
    } catch (e) {
      console.log('   ❌ Orders API: FAILED -', e.message);
    }

    // Test 2: Inventory API (FBA)
    console.log('2. Testing Inventory API (FBA)...');
    try {
      const inventoryResponse = await client.get('/fba/inventory/v1/summaries', {
        granularityType: 'Marketplace',
        granularityId: config.MARKETPLACE_ID,
        marketplaceIds: config.MARKETPLACE_ID
      }, { rateLimitCategory: 'inventory' });
      console.log('   ✅ Inventory API: SUCCESS - Found', inventoryResponse.payload?.inventorySummaries?.length || 0, 'items');
    } catch (e) {
      console.log('   ❌ Inventory API: FAILED -', e.message);
    }

    // Test 3: Sales API
    console.log('3. Testing Sales API...');
    try {
      const salesResponse = await client.get('/sales/v1/orderMetrics', {
        marketplaceIds: config.MARKETPLACE_ID,
        interval: '2025-01-01T00:00:00Z--2025-01-31T23:59:59Z',
        granularity: 'Total'
      }, { rateLimitCategory: 'sales' });
      console.log('   ✅ Sales API: SUCCESS');
      if (salesResponse.payload && salesResponse.payload.length > 0) {
        console.log('      Total Sales:', salesResponse.payload[0]?.totalSales?.amount || 'N/A');
      }
    } catch (e) {
      console.log('   ❌ Sales API: FAILED -', e.message);
    }

    // Test 4: Reports API
    console.log('4. Testing Reports API...');
    try {
      const reportsResponse = await client.get('/reports/2021-06-30/reports', {
        reportTypes: 'GET_FLAT_FILE_OPEN_LISTINGS_DATA',
        marketplaceIds: config.MARKETPLACE_ID,
        pageSize: 5
      }, { rateLimitCategory: 'reports' });
      console.log('   ✅ Reports API: SUCCESS - Found', reportsResponse.reports?.length || 0, 'reports');
    } catch (e) {
      console.log('   ❌ Reports API: FAILED -', e.message);
    }

    console.log('');
    console.log('=== API Test Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAPIs();
