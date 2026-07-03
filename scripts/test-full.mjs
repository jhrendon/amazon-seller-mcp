import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  LWA_CLIENT_ID: process.env.LWA_CLIENT_ID,
  LWA_CLIENT_SECRET: process.env.LWA_CLIENT_SECRET,
  LWA_REFRESH_TOKEN: process.env.LWA_REFRESH_TOKEN,
  SELLER_ID: process.env.SELLER_ID,
  MARKETPLACE_ID: process.env.MARKETPLACE_ID,
  SP_API_ENDPOINT: process.env.SP_API_ENDPOINT,
};

console.log('===========================================');
console.log('       SP-API CREDENTIALS CHECK');
console.log('===========================================\n');

console.log('1. CREDENTIALS:');
console.log('   LWA_CLIENT_ID:', config.LWA_CLIENT_ID ? '✅ Set' : '❌ Missing');
console.log('   LWA_CLIENT_SECRET:', config.LWA_CLIENT_SECRET ? '✅ Set (' + config.LWA_CLIENT_SECRET.length + ' chars)' : '❌ Missing');
console.log('   LWA_REFRESH_TOKEN:', config.LWA_REFRESH_TOKEN ? '✅ Set (' + config.LWA_REFRESH_TOKEN.length + ' chars)' : '❌ Missing');
console.log('   SELLER_ID:', config.SELLER_ID || '❌ Missing');
console.log('   MARKETPLACE_ID:', config.MARKETPLACE_ID || '❌ Missing');
console.log('   SP_API_ENDPOINT:', config.SP_API_ENDPOINT || '❌ Missing');
console.log('');

// Step 1: Get Access Token
console.log('2. TESTING LWA TOKEN EXCHANGE...');
let accessToken;
try {
  const tokenResponse = await axios.post(
    'https://api.amazon.com/auth/o2/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.LWA_REFRESH_TOKEN,
      client_id: config.LWA_CLIENT_ID,
      client_secret: config.LWA_CLIENT_SECRET,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  accessToken = tokenResponse.data.access_token;
  console.log('   ✅ Token exchange SUCCESS');
  console.log('   Token type:', tokenResponse.data.token_type);
  console.log('   Expires in:', tokenResponse.data.expires_in, 'seconds');
  console.log('   Access token (first 50 chars):', accessToken.substring(0, 50) + '...');
} catch (e) {
  console.log('   ❌ Token exchange FAILED');
  console.log('   Error:', e.response?.data || e.message);
  process.exit(1);
}
console.log('');

// Step 2: Test each API
console.log('3. TESTING SP-API ENDPOINTS...\n');

const tests = [
  {
    name: 'Orders API',
    url: '/orders/v0/orders',
    params: {
      MarketplaceIds: config.MARKETPLACE_ID,
      CreatedAfter: '2025-02-01T00:00:00Z',
      MaxResultsPerPage: 5
    }
  },
  {
    name: 'Inventory API (FBA)',
    url: '/fba/inventory/v1/summaries',
    params: {
      granularityType: 'Marketplace',
      granularityId: config.MARKETPLACE_ID,
      marketplaceIds: config.MARKETPLACE_ID
    }
  },
  {
    name: 'Sales API',
    url: '/sales/v1/orderMetrics',
    params: {
      marketplaceIds: config.MARKETPLACE_ID,
      interval: '2025-01-01T00:00:00Z--2025-01-31T23:59:59Z',
      granularity: 'Total'
    }
  },
  {
    name: 'Reports API',
    url: '/reports/2021-06-30/reports',
    params: {
      reportTypes: 'GET_FLAT_FILE_OPEN_LISTINGS_DATA',
      marketplaceIds: config.MARKETPLACE_ID,
      pageSize: 5
    }
  },
  {
    name: 'Sellers API',
    url: '/sellers/v1/marketplaceParticipations',
    params: {}
  }
];

for (const test of tests) {
  console.log(`   Testing ${test.name}...`);
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}${test.url}`,
      {
        params: test.params,
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`   ✅ ${test.name}: SUCCESS`);

    // Show some response data
    if (test.name === 'Orders API' && response.data?.payload?.Orders) {
      console.log(`      Found ${response.data.payload.Orders.length} orders`);
    }
    if (test.name === 'Inventory API (FBA)' && response.data?.payload?.inventorySummaries) {
      console.log(`      Found ${response.data.payload.inventorySummaries.length} inventory items`);
    }
    if (test.name === 'Sellers API' && response.data?.payload) {
      console.log(`      Marketplace participations:`, response.data.payload.length);
    }
  } catch (e) {
    console.log(`   ❌ ${test.name}: FAILED`);
    console.log(`      Status: ${e.response?.status}`);
    console.log(`      Error: ${e.response?.data?.errors?.[0]?.message || e.message}`);
    if (e.response?.data?.errors?.[0]?.code) {
      console.log(`      Code: ${e.response?.data?.errors?.[0]?.code}`);
    }
  }
  console.log('');
}

console.log('===========================================');
console.log('            TEST COMPLETE');
console.log('===========================================');
