const path = require('path');
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');
const Handlebars = require('handlebars');
const { formatCurrency } = require('../utils/formatUtils');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Register Handlebars helper for price formatting
Handlebars.registerHelper('formatPrice', function(price) {
  return formatCurrency(price);
});

// Register Handlebars helper for index + 1
Handlebars.registerHelper('inc', function(value) {
  return parseInt(value) + 1;
});

/**
 * Get price table for a specific customer
 */
exports.getPrintPriceTable = async (req, res) => {
  try {
    const { kiotviet_customer_id } = req.params;

    // Validate customer ID
    if (!kiotviet_customer_id) {
      return res.status(400).send('Customer ID is required');
    }

    console.log(`🔍 Fetching customer info for KiotViet ID: ${kiotviet_customer_id}`);

    // Get customer information
    const { data: customer, error: customerError } = await supabase
      .from('kv_customers')
      .select('name, code, groups')
      .eq('kiotviet_id', kiotviet_customer_id)
      .single();

    if (customerError) {
      console.error('Error fetching customer:', customerError);
      return res.status(500).send('Error fetching customer data');
    }

    if (!customer) {
      console.error('Customer not found:', kiotviet_customer_id);
      return res.status(404).send('Customer not found');
    }

    console.log('✅ Found customer:', customer);

    // Get all active products with their base prices
    const { data: products, error: productsError } = await supabase
      .from('kv_products')
      .select(`
        id,
        full_name,
        base_price,
        is_active
      `)
      .eq('is_active', true)
      .order('full_name');

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return res.status(500).send('Error fetching product data');
    }

    console.log(`✅ Found ${products.length} active products`);

    // Get pricebook prices for these products
    const { data: pricebookPrices, error: pricesError } = await supabase
      .from('kv_product_pricebooks')
      .select(`
        product_id,
        price,
        is_active,
        start_date,
        end_date
      `)
      .eq('is_active', true)
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString());

    if (pricesError) {
      console.error('Error fetching pricebook prices:', pricesError);
      return res.status(500).send('Error fetching price data');
    }

    console.log(`✅ Found ${pricebookPrices?.length || 0} active pricebook prices`);

    // Create a map of special prices by product ID
    const priceMap = {};
    pricebookPrices?.forEach(price => {
      if (!priceMap[price.product_id] || price.price < priceMap[price.product_id]) {
        priceMap[price.product_id] = price.price;
      }
    });

    // Format products data with special prices where available
    const formattedProducts = products.map(product => ({
      fullName: product.full_name,
      price: priceMap[product.id] || product.base_price
    }));

    // Get current date in Vietnamese format
    const now = new Date();
    const currentDate = now.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Read template file
    const templatePath = path.join(__dirname, '../views/templates/price-table.html');
    const templateContent = await fs.readFile(templatePath, 'utf-8');

    // Compile template
    const template = Handlebars.compile(templateContent);

    // Render template with data
    const html = template({
      customerName: customer.name,
      customerCode: customer.code,
      currentDate,
      products: formattedProducts
    });

    // Send response
    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('Error generating price table:', error);
    res.status(500).send('Error generating price table');
  }
};

// Export other print-related controller functions here
exports.getPrintPriceBoard = require('./kiotvietController').getPrintPriceBoard; 