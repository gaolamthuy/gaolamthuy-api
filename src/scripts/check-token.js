/**
 * Check KiotViet Token
 * Simple script to check if we can retrieve the KiotViet token from Supabase
 */

// Load environment variables
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkKiotVietToken() {
  try {
    console.log('Checking KiotViet token in system table...');
    
    // Get token directly from system table
    const { data, error } = await supabase
      .from('system')
      .select('*')
      .eq('title', 'kiotviet')
      .single();
      
    if (error) {
      console.error('Error retrieving KiotViet token:', error.message);
      return;
    }
    
    console.log('System table entry:', data);
    
    if (!data || !data.value) {
      console.error('No KiotViet token found in system table');
      return;
    }
    
    // Check if value is a string (direct token) or an object with token property
    if (typeof data.value === 'string') {
      console.log('Token is stored as direct string value');
      console.log('Token value:', data.value);
      console.log('Token is available');
      // Can't check expiry as it's not stored separately
    } else if (typeof data.value === 'object' && data.value.token) {
      console.log('Token is stored as object with token property');
      console.log('Token value:', data.value.token);
      
      // Show token expiry info if available
      if (data.value.expires_at) {
        const expiryDate = new Date(data.value.expires_at);
        const now = new Date();
        console.log('Token expires at:', expiryDate.toLocaleString());
        console.log('Current time:', now.toLocaleString());
        console.log('Token is', expiryDate > now ? 'valid' : 'expired');
      } else {
        console.log('No expiry information available');
      }
    } else {
      console.error('Token is not properly stored in the system table');
    }
  } catch (error) {
    console.error('Error checking KiotViet token:', error.message);
  }
}

// Run the check
checkKiotVietToken()
  .then(() => {
    console.log('Check completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }); 