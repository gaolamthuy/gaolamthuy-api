/**
 * Product and Category Data Utilities
 * 
 * This module provides utility functions for retrieving and
 * formatting product and category data from the database.
 */

const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Find a product by tag string
 * @param {string} tagString - The tag to search for
 * @returns {Promise<Object>} Found product and any errors
 */
async function findProductByTag(tagString) {
  // Try exact match first
  const { data: exactMatches, error: searchError } = await supabase
    .from('kv_products')
    .select('*, glt_gallery_thumbnail_title')
    .contains('glt_tags', [tagString]);
  
  if (searchError) {
    return { product: null, error: searchError, message: 'Error searching for product by tag' };
  }
  
  // If exact match found, return the first result
  if (exactMatches && exactMatches.length > 0) {
    return { 
      product: exactMatches[0], 
      multipleMatches: exactMatches.length > 1,
      matchCount: exactMatches.length,
      error: null 
    };
  }
  
  // Try case-insensitive search as fallback
  const { data: allProducts } = await supabase
    .from('kv_products')
    .select('*, glt_gallery_thumbnail_title');
  
  if (!allProducts || allProducts.length === 0) {
    return { 
      product: null, 
      error: new Error('No products found'), 
      message: `No product found with tag: ${tagString}` 
    };
  }
  
  // Filter for case-insensitive match
  const caseInsensitiveMatches = allProducts.filter(p => 
    p.glt_tags && Array.isArray(p.glt_tags) && 
    p.glt_tags.some(tag => tag && tag.toLowerCase() === tagString.toLowerCase())
  );
  
  if (caseInsensitiveMatches.length > 0) {
    return { 
      product: caseInsensitiveMatches[0],
      multipleMatches: caseInsensitiveMatches.length > 1,
      matchCount: caseInsensitiveMatches.length,
      error: null
    };
  }
  
  return { 
    product: null, 
    error: new Error('No matches found'), 
    message: `No product found with tag: ${tagString}` 
  };
}

/**
 * Get category information by ID with fallback search mechanism
 * @param {number} categoryId - The category ID to search for
 * @returns {Promise<Object>} Category info (name, color) and success status
 */
async function getCategoryInfo(categoryId) {
  if (!categoryId) {
    return {
      success: false,
      categoryName: 'Không xác định',
      borderColor: '#ffb96e',
      message: 'No category ID provided'
    };
  }
  
  try {
    // First try direct lookup by category_id
    const { data: category } = await supabase
      .from('kv_product_categories')
      .select('category_name, glt_color_border, category_id')
      .eq('category_id', categoryId)
      .single();
    
    if (category) {
      return {
        success: true,
        categoryName: category.category_name || 'Không xác định',
        borderColor: category.glt_color_border || '#ffb96e',
        message: `Found category: ${category.category_name} with ID ${categoryId}`
      };
    }
    
    // Try alternate lookup with string comparison
    const { data: allCategories } = await supabase
      .from('kv_product_categories')
      .select('category_name, glt_color_border, category_id')
      .limit(100);
    
    if (allCategories && allCategories.length > 0) {
      const found = allCategories.find(cat => String(cat.category_id) === String(categoryId));
      
      if (found) {
        return {
          success: true,
          categoryName: found.category_name || 'Không xác định',
          borderColor: found.glt_color_border || '#ffb96e',
          message: `Found category via alternate lookup: ${found.category_name} with ID ${found.category_id}`
        };
      }
    }
    
    // Default values if no match found
    return {
      success: false,
      categoryName: 'Không xác định',
      borderColor: '#ffb96e',
      message: `Category with ID ${categoryId} not found`
    };
  } catch (error) {
    return {
      success: false,
      categoryName: 'Không xác định',
      borderColor: '#ffb96e',
      error,
      message: `Error fetching category: ${error.message}`
    };
  }
}

/**
 * Get product pricing information
 * @param {number} productId - Product ID
 * @returns {Promise<Object>} Pricing info (basePrice, costPrice) and success status
 */
async function getProductPricing(productId) {
  try {
    // Get base price from products table
    const { data: product } = await supabase
      .from('kv_products')
      .select('base_price, order_template')
      .eq('id', productId)
      .single();
    
    // Get cost price from inventories table
    const { data: inventory } = await supabase
      .from('kv_product_inventories')
      .select('cost')
      .eq('product_id', productId)
      .limit(1)
      .single();
    
    // Format prices for display
    const formatPrice = (price) => {
      return price ? price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : 'Không xác định';
    };
    
    // Calculate cost price (cost + 2000)
    const costPrice = inventory && inventory.cost 
      ? formatPrice(parseInt(inventory.cost) + 2000)
      : 'Không xác định';
    
    // Format base price
    const basePrice = product && product.base_price
      ? formatPrice(product.base_price)
      : 'Không xác định';
    
    // Get order template
    const orderTemplate = product?.order_template || 'Không xác định';
    
    return {
      success: true,
      basePrice,
      costPrice,
      orderTemplate,
      message: `Found pricing info for product ${productId}`
    };
  } catch (error) {
    return {
      success: false,
      basePrice: 'Không xác định',
      costPrice: 'Không xác định',
      orderTemplate: 'Không xác định',
      error,
      message: `Error fetching pricing: ${error.message}`
    };
  }
}

/**
 * Generate a slug from product name or code
 * @param {Object} product - The product object
 * @returns {string} A slug string
 */
function generateProductSlug(product) {
  let baseSlug = '';
  
  // Use name as primary source if available
  if (product.name) {
    baseSlug = product.name.toLowerCase();
  } 
  // Fallback to code
  else if (product.code) {
    baseSlug = product.code.toLowerCase();
  } 
  // Last resort, use kiotviet_id with prefix
  else {
    baseSlug = `product-${product.kiotviet_id}`;
  }
  
  // Replace special characters and spaces with dashes
  let slug = baseSlug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric chars except spaces and dashes
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Replace multiple dashes with single dash
    .trim();
    
  // Add kiotviet_id at the end to ensure uniqueness
  return `${slug}-${product.kiotviet_id}`;
}

/**
 * Get short price string for thumbnail overlay
 * @param {number} productId - Product ID
 * @returns {Promise<string|null>} Short price string or null if not available
 */
async function getShortPriceString(productId) {
  const { data: inventory } = await supabase
    .from('kv_product_inventories')
    .select('cost')
    .eq('product_id', productId)
    .limit(1)
    .single();

  if (!inventory || !inventory.cost) return null;

  const cost = parseFloat(inventory.cost) + 2000;
  const costShort = (cost / 1000).toFixed(1);

  const { data: product } = await supabase
    .from('kv_products')
    .select('base_price')
    .eq('id', productId)
    .single();

  if (!product || !product.base_price) return null;

  const basePriceShort = (parseFloat(product.base_price) / 1000).toFixed(1);

  return `${basePriceShort}/${costShort}`;
}

/**
 * Update product slug in database
 * @param {string} kiotvietId - KiotViet ID of the product
 * @param {string} slug - Slug to save
 * @returns {Promise<Object>} Result of the update operation
 */
async function updateProductSlug(kiotvietId, slug) {
  try {
    const { data, error } = await supabase
      .from('kv_products')
      .update({ glt_slug: slug })
      .eq('kiotviet_id', kiotvietId);
      
    if (error) {
      return {
        success: false,
        error,
        message: `Error updating product slug: ${error.message}`
      };
    }
    
    return {
      success: true,
      data,
      message: `Updated slug for product ${kiotvietId}`
    };
  } catch (error) {
    return {
      success: false,
      error,
      message: `Error updating product slug: ${error.message}`
    };
  }
}

/**
 * Update product's image timestamp
 * @param {string} kiotvietId - KiotViet ID of the product
 * @param {number} imageUpdatedAt - Timestamp for image update
 * @returns {Promise<Object>} Updated product data
 */
async function updateProductImageTimestamp(kiotvietId, imageUpdatedAt) {
  try {
    const { data, error } = await supabase
      .from('kv_products')
      .update({
        glt_image_updated_at: imageUpdatedAt,
        glt_updated_at: new Date().toISOString()
      })
      .eq('kiotviet_id', kiotvietId)
      .select()
      .single();
      
    if (error) {
      return {
        success: false,
        error,
        message: `Error updating product in database: ${error.message}`
      };
    }
    
    return {
      success: true,
      product: data,
      message: `Updated image timestamp for product ${kiotvietId}`
    };
  } catch (error) {
    return {
      success: false,
      error,
      message: `Error updating product: ${error.message}`
    };
  }
}

module.exports = {
  findProductByTag,
  getCategoryInfo,
  getProductPricing,
  generateProductSlug,
  getShortPriceString,
  updateProductSlug,
  updateProductImageTimestamp,
  supabase // Export for direct access when needed
}; 