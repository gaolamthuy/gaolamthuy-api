#!/usr/bin/env node
/**
 * KiotViet Token Refresh Utility
 * 
 * This script gets a new KiotViet token and stores it in the Supabase system table.
 * It should be scheduled to run daily to ensure we always have a valid token.
 * 
 * Recommended cron schedule: 0 0 * * * (daily at midnight)
 */

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Get a fresh KiotViet token and save it to Supabase
 */
async function refreshKiotVietToken() {
  try {
    console.log('Getting new KiotViet token...');
    
    // Request new token from KiotViet API
    const response = await axios.post(
      `${process.env.KIOTVIET_BASE_URL}/connect/token`,
      new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': process.env.KIOTVIET_CLIENT_ID,
        'client_secret': process.env.KIOTVIET_CLIENT_SECRET,
        'scopes': 'PublicApi.Access'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const { access_token, expires_in } = response.data;
    
    // Add expiration timestamp to the token data
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);
    
    const tokenData = {
      token: access_token,
      expires_in,
      expires_at: expiresAt.toISOString()
    };
    
    // Save token to Supabase
    const { data, error } = await supabase
      .from('system')
      .update({ value: tokenData })
      .eq('title', 'kiotviet');
    
    if (error) {
      console.error('Error updating token in Supabase:', error);
      throw error;
    }
    
    console.log('KiotViet token successfully refreshed and stored in Supabase');
    console.log(`Token will expire at: ${expiresAt.toISOString()}`);
    
    return tokenData;
  } catch (error) {
    console.error('Failed to refresh KiotViet token:', error.message);
    throw error;
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  refreshKiotVietToken()
    .then(() => {
      console.log('Token refresh completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Token refresh failed:', error);
      process.exit(1);
    });
}

module.exports = {
  refreshKiotVietToken
}; 