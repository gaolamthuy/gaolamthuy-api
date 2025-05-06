/**
 * Test script for cloning invoices for a specific day
 * This script allows testing the cloneInvoicesByDay function directly
 * without going through the HTTP API
 */

// Load environment variables
require('dotenv').config();

// Import kiotvietService
const kiotvietService = require('../services/kiotvietService');

/**
 * Get command line arguments or use today's date
 * Usage: node test-invoice-day-sync.js [YYYY] [MM] [DD]
 */
async function run() {
  try {
    console.log('🔄 KiotViet invoice by day test script');
    
    // Get date from command line arguments or use today
    const args = process.argv.slice(2);
    const today = new Date();
    
    let year, month, day;
    
    if (args.length >= 3) {
      [year, month, day] = args;
    } else {
      year = today.getFullYear().toString();
      month = (today.getMonth() + 1).toString();
      day = today.getDate().toString();
    }
    
    // Format date for display
    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    console.log(`📅 Target date: ${formattedDate}`);
    
    // Attempt to get token (just to test connection)
    try {
      const token = await kiotvietService.getKiotVietToken();
      console.log('✅ Successfully retrieved KiotViet token');
    } catch (tokenError) {
      console.error('❌ Failed to retrieve KiotViet token:', tokenError.message);
      process.exit(1);
    }
    
    // Execute the invoice cloning process
    console.log(`🔄 Starting invoice clone for ${formattedDate}...`);
    const result = await kiotvietService.cloneInvoicesByDay(year, month, day);
    
    console.log('✅ Operation completed successfully:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error running test script:', error);
    process.exit(1);
  }
}

// Run the script
run(); 