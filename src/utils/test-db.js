require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log('Supabase URL:', SUPABASE_URL ? 'Set' : 'Not set');
console.log('Supabase Key:', SUPABASE_SERVICE_KEY ? 'Set' : 'Not set');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Environment variables SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const testDatabase = async () => {
  try {
    console.log('Testing Supabase connection...');
    
    // Test querying products
    console.log('\nQuerying products:');
    const { data: products, error: productsError } = await supabase
      .from('kv_products')
      .select('id, name, code')
      .limit(3);
    
    if (productsError) {
      console.error('Error querying products:', productsError);
    } else {
      console.log('Found products:', products.length);
      console.log('Sample product:', products[0]);
    }
    
    // Test querying a specific invoice
    console.log('\nQuerying invoice HD057559:');
    const { data: invoice, error: invoiceError } = await supabase
      .from('kv_invoices')
      .select('id, code')
      .eq('code', 'HD057559')
      .single();
    
    if (invoiceError) {
      console.error('Error querying invoice:', invoiceError);
    } else {
      console.log('Found invoice:', invoice);
    }
    
    // Test querying a specific product
    console.log('\nQuerying product with code 2011102:');
    const { data: product, error: productError } = await supabase
      .from('kv_products')
      .select('id, name, code')
      .eq('code', '2011102')
      .single();
    
    if (productError) {
      console.error('Error querying product:', productError);
    } else {
      console.log('Found product:', product);
    }
    
    console.log('\nDatabase test completed.');
  } catch (error) {
    console.error('Error testing database connection:', error);
  }
};

testDatabase(); 