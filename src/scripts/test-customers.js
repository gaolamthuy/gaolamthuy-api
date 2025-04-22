/**
 * Test KiotViet Customers API
 * Simple script to test retrieving customers from KiotViet API
 */

// Load environment variables
require('dotenv').config();

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const KV_RETAILER = process.env.KIOTVIET_RETAILER;
const KV_API_URL = process.env.KIOTVIET_PUBLIC_API_URL || 'https://public.kiotapi.com';

async function getKiotVietToken() {
  try {
    // Get token directly from system table
    const { data, error } = await supabase
      .from('system')
      .select('value')
      .eq('title', 'kiotviet')
      .single();
      
    if (error) {
      console.error('Error retrieving KiotViet token:', error.message);
      throw new Error(`Failed to retrieve KiotViet token: ${error.message}`);
    }
    
    if (!data || !data.value) {
      console.error('No KiotViet token found in system table');
      throw new Error('No KiotViet token available');
    }
    
    // Handle token based on how it's stored
    if (typeof data.value === 'string') {
      // Token is stored directly as a string
      console.log('Using KiotViet token from system table (stored as string)');
      return data.value;
    } else if (typeof data.value === 'object' && data.value.token) {
      // Token is stored as an object with a token property
      console.log('Using KiotViet token from system table (stored as object)');
      return data.value.token;
    } else {
      console.error('Token is not properly stored in the system table');
      throw new Error('Token format in system table is invalid');
    }
  } catch (error) {
    console.error('Error getting KiotViet token:', error.message);
    throw error;
  }
}

async function testCustomersAPI() {
  try {
    console.log('Testing KiotViet Customers API...');
    
    // Get the token
    const token = await getKiotVietToken();
    console.log('Token retrieved successfully');
    
    // Setup request headers
    const headers = {
      'Retailer': KV_RETAILER,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // Make a test request to get a few customers
    console.log('Making request to KiotViet API...');
    const response = await axios.get(`${KV_API_URL}/customers`, {
      headers,
      params: {
        pageSize: 5,
        currentItem: 0
      }
    });
    
    console.log('API response status:', response.status);
    console.log('Total customers available:', response.data.total);
    console.log('Sample of customer data:', JSON.stringify(response.data.data[0], null, 2));
    
    return response.data;
  } catch (error) {
    console.error('Error testing KiotViet Customers API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Run the test
testCustomersAPI()
  .then((data) => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error.message);
    process.exit(1);
  }); 