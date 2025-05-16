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

    // Check if customer has a group assigned
    if (!customer.groups) {
      return res.status(404).send(`No specific pricebook for this customer: ${customer.name} (${customer.code})`);
    }

    // Get active categories
    const { data: categories, error: categoriesError } = await supabase
      .from('kv_product_categories')
      .select('category_id, category_name, rank')
      .eq('glt_is_active', true)
      .order('rank');

    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError);
      return res.status(500).send('Error fetching categories');
    }

    // Get all active products with their categories
    const { data: products, error: productsError } = await supabase
      .from('kv_products')
      .select(`
        id,
        full_name,
        base_price,
        is_active,
        category_id,
        category_name
      `)
      .eq('is_active', true)
      .eq('unit', "kg")
      .order('category_name, full_name');

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return res.status(500).send('Error fetching product data');
    }

    console.log(`✅ Found ${products.length} active products`);

    // Get pricebook prices for these products with the customer's group
    const { data: pricebookPrices, error: pricesError } = await supabase
      .from('kv_product_pricebooks')
      .select(`
        product_id,
        price,
        is_active,
        start_date,
        end_date,
        customer_group_name
      `)
      .eq('is_active', true)
      .eq('customer_group_name', customer.groups)
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString());

    if (pricesError) {
      console.error('Error fetching pricebook prices:', pricesError);
      return res.status(500).send('Error fetching price data');
    }

    console.log(`✅ Found ${pricebookPrices?.length || 0} active pricebook prices for customer group ${customer.groups}`);

    // If no prices found for the customer's group, return appropriate message
    if (!pricebookPrices || pricebookPrices.length === 0) {
      return res.status(404).send(`No active pricebook found for customer group: ${customer.groups}`);
    }

    // Create a map of special prices by product ID
    const priceMap = {};
    pricebookPrices?.forEach(price => {
      if (!priceMap[price.product_id] || price.price < priceMap[price.product_id]) {
        priceMap[price.product_id] = price.price;
      }
    });

    // Create a map of categories with their products
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.category_id, {
        name: cat.category_name,
        rank: cat.rank,
        products: []
      });
    });

    // Group products by category and calculate their final prices
    products.forEach(product => {
      if (categoryMap.has(product.category_id)) {
        categoryMap.get(product.category_id).products.push({
          fullName: product.full_name,
          price: priceMap[product.id] || product.base_price
        });
      }
    });

    // Sort products by price within each category
    categoryMap.forEach(category => {
      category.products.sort((a, b) => a.price - b.price);
    });

    // Convert map to array and filter out categories with no products
    const productCategories = Array.from(categoryMap.values())
      .filter(category => category.products.length > 0)
      .sort((a, b) => a.rank - b.rank); // Sort by category rank

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
      categories: productCategories
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

/**
 * Get retail price table (no customer specific pricing)
 */
exports.getPrintRetailPriceTable = async (req, res) => {
  try {
    console.log('🛍️ Generating retail price table...');

    // Get active categories
    const { data: categories, error: categoriesError } = await supabase
      .from('kv_product_categories')
      .select('category_id, category_name, rank')
      .eq('glt_is_active', true)
      .order('rank');

    if (categoriesError) {
      console.error('Error fetching categories for retail price table:', categoriesError);
      return res.status(500).send('Error fetching categories');
    }
    console.log(`✅ Found ${categories.length} active categories for retail price table.`);

    // Get all active products
    const { data: products, error: productsError } = await supabase
      .from('kv_products')
      .select('id, full_name, base_price, category_id, category_name')
      .eq('is_active', true)
      .eq('unit', 'kg') // Consistent with other price table
      .order('category_name, full_name');

    if (productsError) {
      console.error('Error fetching products for retail price table:', productsError);
      return res.status(500).send('Error fetching product data');
    }
    console.log(`✅ Found ${products.length} active products for retail price table.`);

    // Get inventory costs for these products
    const productIds = products.map(p => p.id);
    let costMap = {};
    if (productIds.length > 0) {
        const { data: inventories, error: inventoriesError } = await supabase
            .from('kv_product_inventories')
            .select('product_id, cost')
            .in('product_id', productIds);

        if (inventoriesError) {
            console.error('Error fetching inventories for retail price table:', inventoriesError);
            // Decide if this is fatal or if we can proceed without costs for some items
            // For now, log and continue, costs might be 0 if not found.
        } else {
            console.log(`✅ Found ${inventories.length} inventory records for products.`);
            inventories.forEach(inv => {
                // If multiple costs per product, take the minimum, or first one encountered.
                // Assuming cost is a number.
                if (inv.cost !== null && inv.cost !== undefined) {
                    if (!costMap[inv.product_id] || inv.cost < costMap[inv.product_id]) {
                        costMap[inv.product_id] = parseFloat(inv.cost);
                    }
                }
            });
        }
    }

    // Create a map of categories with their products
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.category_id, {
        name: cat.category_name,
        rank: cat.rank,
        products: []
      });
    });

    // Group products by category and calculate their prices
    products.forEach(product => {
      if (categoryMap.has(product.category_id)) {
        const productCost = costMap[product.id] || 0; // Default to 0 if no cost found
        categoryMap.get(product.category_id).products.push({
          fullName: product.full_name,
          basePrice: product.base_price, // This will be "Giá bán lẻ"
          retailPrice: productCost + 2000, // This will be "Giá sỉ"
          cost: productCost // For sorting
        });
      }
    });

    // Sort products by cost within each category
    categoryMap.forEach(category => {
      category.products.sort((a, b) => a.cost - b.cost);
    });

    // Convert map to array and filter out categories with no products
    const productCategories = Array.from(categoryMap.values())
      .filter(category => category.products.length > 0)
      .sort((a, b) => a.rank - b.rank); // Sort by category rank

    // Get current date in Vietnamese format
    const now = new Date();
    const currentDate = now.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Read template file - using the new retail-specific template
    const templatePath = path.join(__dirname, '../views/templates/price-table-retail.html');
    const templateContent = await fs.readFile(templatePath, 'utf-8');

    // Compile template
    const template = Handlebars.compile(templateContent);

    // Render template with data
    const html = template({
      pageTitle: 'BẢNG GIÁ BÁN LẺ & SỈ', // Updated title
      currentDate,
      categories: productCategories
    });

    // Send response
    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('Error generating retail price table:', error);
    res.status(500).send('Error generating retail price table');
  }
}; 