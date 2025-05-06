// Test script for print functionality
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');
const { formatCurrency, formatDateTime, formatDate } = require('../../utils/formatters');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('🔍 Starting print test script');

// Helper functions
async function loadTemplate(templateName) {
  const templatePath = path.join(__dirname, `../../views/templates/${templateName}.html`);
  console.log(`Loading template from: ${templatePath}`);
  try {
    return await fs.readFile(templatePath, 'utf8');
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error.message);
    throw error;
  }
}

async function testInvoiceTemplate() {
  try {
    console.log('\n--- Testing Invoice Template ---');
    const html = await loadTemplate('invoice');
    console.log('✅ Successfully loaded invoice template');
    console.log(`Template size: ${html.length} characters`);
    return true;
  } catch (error) {
    console.error('❌ Failed to load invoice template');
    return false;
  }
}

async function testLabelTemplate() {
  try {
    console.log('\n--- Testing Label Template ---');
    const html = await loadTemplate('label');
    console.log('✅ Successfully loaded label template');
    console.log(`Template size: ${html.length} characters`);
    return true;
  } catch (error) {
    console.error('❌ Failed to load label template');
    return false;
  }
}

async function testSupabaseConnection() {
  try {
    console.log('\n--- Testing Supabase Connection ---');
    
    // Test querying products
    const { data: products, error: productsError } = await supabase
      .from('kv_products')
      .select('id, name, code')
      .limit(1);
    
    if (productsError) {
      console.error('❌ Error querying products:', productsError);
      return false;
    } else {
      console.log('✅ Successfully connected to Supabase');
      console.log(`Found ${products.length} products`);
      return true;
    }
  } catch (error) {
    console.error('❌ Error testing Supabase connection:', error);
    return false;
  }
}

// Main function
async function main() {
  let success = true;
  
  // Test Supabase connection
  const dbSuccess = await testSupabaseConnection();
  if (!dbSuccess) success = false;
  
  // Test templates
  const invoiceSuccess = await testInvoiceTemplate();
  if (!invoiceSuccess) success = false;
  
  const labelSuccess = await testLabelTemplate();
  if (!labelSuccess) success = false;
  
  // Print summary
  console.log('\n--- Test Summary ---');
  console.log(`Database Connection: ${dbSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Invoice Template: ${invoiceSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Label Template: ${labelSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Overall Status: ${success ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
}

// Run the script
main()
  .then(() => console.log('\nTest script completed'))
  .catch(err => console.error('Error in test script:', err)); 