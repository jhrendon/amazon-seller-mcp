import axios from 'axios';
import { getTokenManager } from '../build/auth/token-manager.js';
import { getConfig } from '../build/config/index.js';

async function testRaw() {
  const config = getConfig();
  const tokenManager = getTokenManager();
  const accessToken = await tokenManager.getAccessToken();

  console.log('Config:');
  console.log('  Marketplace:', config.MARKETPLACE_ID);
  console.log('  Seller ID:', config.SELLER_ID);
  console.log('  Endpoint:', config.SP_API_ENDPOINT);
  console.log('  Token (first 50 chars):', accessToken.substring(0, 50) + '...');
  console.log('');

  // Test Inventory API
  console.log('=== Testing Inventory API ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/fba/inventory/v1/summaries`,
      {
        params: {
          granularityType: 'Marketplace',
          granularityId: config.MARKETPLACE_ID,
          marketplaceIds: config.MARKETPLACE_ID
        },
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('SUCCESS!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.log('FAILED');
    console.log('Status:', e.response?.status);
    console.log('Headers:', JSON.stringify(e.response?.headers, null, 2));
    console.log('Data:', JSON.stringify(e.response?.data, null, 2));
  }

  console.log('');
  console.log('=== Testing Sales API ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/sales/v1/orderMetrics`,
      {
        params: {
          marketplaceIds: config.MARKETPLACE_ID,
          interval: '2025-01-01T00:00:00Z--2025-01-31T23:59:59Z',
          granularity: 'Total'
        },
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('SUCCESS!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.log('FAILED');
    console.log('Status:', e.response?.status);
    console.log('Data:', JSON.stringify(e.response?.data, null, 2));
  }
}

testRaw();
