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

async function debug() {
  // Get Access Token
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

  const accessToken = tokenResponse.data.access_token;
  console.log('Token Response:', JSON.stringify(tokenResponse.data, null, 2));
  console.log('');

  // Check Sellers API for marketplace participations
  console.log('=== Checking Seller Marketplace Participations ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/sellers/v1/marketplaceParticipations`,
      {
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Marketplaces:', JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.log('Error:', e.response?.data);
  }

  // Try different inventory endpoint
  console.log('\n=== Try Inventory Summaries with seller ID ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/fba/inventory/v1/summaries`,
      {
        params: {
          granularityType: 'Marketplace',
          granularityId: config.MARKETPLACE_ID,
          marketplaceIds: config.MARKETPLACE_ID,
          sellerSku: '' // empty to get all
        },
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('SUCCESS:', JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.log('Error Status:', e.response?.status);
    console.log('Error Data:', JSON.stringify(e.response?.data, null, 2));
  }

  // Try catalog items API (different approach)
  console.log('\n=== Try Catalog Items API ===');
  try {
    const response = await axios.get(
      `${config.SP_API_ENDPOINT}/catalog/2022-04-01/items`,
      {
        params: {
          marketplaceIds: config.MARKETPLACE_ID,
          sellerId: config.SELLER_ID,
          pageSize: 5
        },
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('SUCCESS:', JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.log('Error Status:', e.response?.status);
    console.log('Error:', e.response?.data?.errors?.[0]?.message || e.message);
  }
}

debug();
