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

async function test() {
  // Get Access Token
  const tokenResponse = await axios.post(
    'https://api.amazon.com/auth/o2/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.LWA_REFRESH_TOKEN,
      client_id: config.LWA_CLIENT_ID,
      client_secret: config.LWA_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const accessToken = tokenResponse.data.access_token;
  console.log('Token obtained successfully\n');

  // Test 1: Try FBA Inventory with different parameters
  console.log('=== Test 1: FBA Inventory Summaries ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/fba/inventory/v1/summaries`,
      {
        params: {
          details: true,
          granularityType: 'Marketplace',
          granularityId: config.MARKETPLACE_ID,
          marketplaceIds: config.MARKETPLACE_ID
        },
        headers: { 'x-amz-access-token': accessToken }
      }
    );
    console.log('✅ SUCCESS:', JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.log('❌ FAILED:', e.response?.status, e.response?.data?.errors?.[0]?.message);
  }

  // Test 2: Try Listings Items API (uses Product Listing role)
  console.log('\n=== Test 2: Listings Items API ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/listings/2021-08-01/items/${config.SELLER_ID}`,
      {
        params: {
          marketplaceIds: config.MARKETPLACE_ID,
          pageSize: 5
        },
        headers: { 'x-amz-access-token': accessToken }
      }
    );
    console.log('✅ SUCCESS:', JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.log('❌ FAILED:', e.response?.status, e.response?.data?.errors?.[0]?.message);
  }

  // Test 3: Try Pricing API (uses Pricing role)
  console.log('\n=== Test 3: Pricing API ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/products/pricing/v0/price`,
      {
        params: {
          MarketplaceId: config.MARKETPLACE_ID,
          ItemType: 'Asin',
          Asins: 'B08N5WRWNW' // example ASIN
        },
        headers: { 'x-amz-access-token': accessToken }
      }
    );
    console.log('✅ SUCCESS');
  } catch (e) {
    console.log('❌ FAILED:', e.response?.status, e.response?.data?.errors?.[0]?.message);
  }

  // Test 4: Try Fulfillment Inbound API (uses Amazon Fulfillment role)
  console.log('\n=== Test 4: FBA Inbound Eligibility ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/fba/inbound/v1/eligibility/itemPreview`,
      {
        params: {
          marketplaceIds: config.MARKETPLACE_ID,
          asin: 'B08N5WRWNW'
        },
        headers: { 'x-amz-access-token': accessToken }
      }
    );
    console.log('✅ SUCCESS');
  } catch (e) {
    console.log('❌ FAILED:', e.response?.status, e.response?.data?.errors?.[0]?.message);
  }

  // Test 5: Reports - try creating a report
  console.log('\n=== Test 5: Reports API - Get Reports ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/reports/2021-06-30/reports`,
      {
        params: {
          reportTypes: 'GET_MERCHANT_LISTINGS_ALL_DATA',
          marketplaceIds: config.MARKETPLACE_ID
        },
        headers: { 'x-amz-access-token': accessToken }
      }
    );
    console.log('✅ SUCCESS: Found', response.data?.reports?.length || 0, 'reports');
  } catch (e) {
    console.log('❌ FAILED:', e.response?.status, e.response?.data?.errors?.[0]?.message);
  }
}

test();
