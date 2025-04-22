/**
 * KiotViet Service
 * Handles the actual API calls and data processing for KiotViet integration
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// KiotViet API Configuration
const KV_RETAILER = process.env.KIOTVIET_RETAILER;
const KV_API_URL = process.env.KIOTVIET_PUBLIC_API_URL || 'https://public.kiotapi.com';

/**
 * Get KiotViet authentication token from Supabase
 * @returns {Promise<string>} The authentication token
 */
async function getKiotVietToken() {
  try {
    // Get token directly from system table
    const { data, error } = await supabase
      .from('system')
      .select('value')
      .eq('title', 'kiotviet')
      .single();
      
    if (error) {
      console.error("Error retrieving KiotViet token:", error.message);
      throw new Error(`Failed to retrieve KiotViet token: ${error.message}`);
    }
    
    if (!data || !data.value) {
      console.error("No KiotViet token found in system table");
      throw new Error("No KiotViet token available");
    }
    
    // Handle token based on how it's stored
    if (typeof data.value === 'string') {
      // Token is stored directly as a string
      console.log("Using KiotViet token from system table (stored as string)");
      return data.value;
    } else if (typeof data.value === 'object' && data.value.token) {
      // Token is stored as an object with a token property
      console.log("Using KiotViet token from system table (stored as object)");
      return data.value.token;
    } else {
      console.error("Token is not properly stored in the system table");
      throw new Error("Token format in system table is invalid");
    }
  } catch (error) {
    console.error("Error getting KiotViet token:", error.message);
    throw error;
  }
}

/**
 * Get KiotViet API headers with authentication
 * @returns {Promise<Object>} Headers for API requests
 */
async function getKiotVietHeaders() {
  const token = await getKiotVietToken();
  return {
    'Retailer': KV_RETAILER,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Fetch all pages of data from a KiotViet API endpoint
 * @param {string} endpoint - API endpoint path
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} All results combined from paged API
 */
async function fetchAllPages(endpoint, params = {}) {
  try {
    let allResults = [];
    let currentPage = 1;
    let hasMorePages = true;
    const pageSize = 100;
    const headers = await getKiotVietHeaders();

    while (hasMorePages) {
      console.log(`📄 Fetching ${endpoint} - Page ${currentPage} (${allResults.length} items so far)`);
      
      const response = await axios.get(`${KV_API_URL}${endpoint}`, {
        headers,
        params: {
          ...params,
          pageSize,
          currentItem: (currentPage - 1) * pageSize
        }
      });

      const { data, total } = response.data;
      
      if (!data || data.length === 0) {
        hasMorePages = false;
      } else {
        allResults = [...allResults, ...data];
        
        if (allResults.length >= total) {
          hasMorePages = false;
        } else {
          currentPage++;
        }
      }
    }

    console.log(`✅ Fetched ${allResults.length} total items from ${endpoint}`);
    return allResults;
  } catch (error) {
    console.error(`❌ Error fetching data from ${endpoint}:`, error.message);
    throw error;
  }
}

/**
 * Fetch and save products from KiotViet API
 * @returns {Promise<Object>} Results of the operation
 */
async function cloneProducts() {
  try {
    console.log("🔄 Starting product sync process");
    
    // Fetch products from KiotViet API
    const products = await fetchAllPages('/products', { 
      includeInventory: true
    });
    
    if (products.length === 0) {
      return { success: true, message: "No products found to sync", count: 0 };
    }
    
    console.log(`📦 Processing ${products.length} products...`);
    
    // Process in batches
    const batchSize = 50;
    let successCount = 0;
    let errorCount = 0;
    let inventoryCount = 0;
    
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, Math.min(i + batchSize, products.length));
      
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)}`);
      
      const productRows = [];
      
      for (const product of batch) {
        try {
          // Map KiotViet product data to our database structure
          productRows.push({
            kiotviet_id: product.id,
            retailer_id: product.retailerId,
            code: product.code,
            bar_code: product.barCode || '',
            name: product.name,
            full_name: product.fullName || product.name,
            category_id: product.categoryId,
            category_name: product.categoryName,
            allows_sale: product.allowsSale,
            type: product.type,
            has_variants: product.hasVariants,
            base_price: product.basePrice,
            weight: product.weight || null,
            unit: product.unit,
            master_product_id: product.masterProductId || null,
            master_unit_id: product.masterUnitId || null,
            conversion_value: product.conversionValue,
            description: product.description || '',
            modified_date: product.modifiedDate ? new Date(product.modifiedDate) : null,
            created_date: product.createdDate ? new Date(product.createdDate) : null,
            is_active: product.isActive,
            order_template: product.orderTemplate || '',
            is_lot_serial_control: product.isLotSerialControl || false,
            is_batch_expire_control: product.isBatchExpireControl || false,
            trade_mark_name: product.tradeMarkName || '',
            trade_mark_id: product.tradeMarkId || null,
            images: product.images || [],
            synced_at: new Date()
          });
          
          successCount++;
        } catch (error) {
          console.error(`❌ Error processing product ${product.code}:`, error.message);
          errorCount++;
        }
      }
      
      if (productRows.length > 0) {
        // Upsert products to kv_products table
        const { error } = await supabase
          .from('kv_products')
          .upsert(productRows, { 
            onConflict: 'kiotviet_id',
            ignoreDuplicates: false
          });
          
        if (error) {
          console.error("❌ Error upserting products:", error);
          errorCount += productRows.length;
          successCount -= productRows.length;
          continue; // Skip processing inventories if products failed
        }
        
        // Process inventories for each product
        console.log(`📦 Processing inventories for ${productRows.length} products`);
        
        // Get product IDs mapping
        const { data: productMappings, error: mappingError } = await supabase
          .from('kv_products')
          .select('id, kiotviet_id')
          .in('kiotviet_id', productRows.map(p => p.kiotviet_id));
          
        if (mappingError) {
          console.error("❌ Error getting product mappings:", mappingError);
          continue;
        }
        
        // Create a lookup map for product IDs
        const productIdMap = {};
        for (const mapping of productMappings) {
          productIdMap[mapping.kiotviet_id] = mapping.id;
        }
        
        // Process inventories in batches
        for (const product of batch) {
          if (!product.inventories || !Array.isArray(product.inventories)) {
            continue;
          }
          
          const productId = productIdMap[product.id];
          if (!productId) {
            console.warn(`⚠️ Could not find database ID for product ${product.id} (${product.code})`);
            continue;
          }
          
          const inventoryRows = [];
          
          for (const inventory of product.inventories) {
            inventoryRows.push({
              product_id: productId,
              branch_id: inventory.branchId,
              branch_name: inventory.branchName,
              on_hand: inventory.onHand || 0,
              on_sales: inventory.onHand || 0,  // Assuming on_sales is the same as onHand if not provided
              reserved: inventory.reserved || 0,
              minimum_inventory: inventory.minQuantity || 0,
              last_sync: new Date(),
              synced_at: new Date()
            });
          }
          
          if (inventoryRows.length > 0) {
            // Delete existing inventories for this product
            const { error: deleteError } = await supabase
              .from('kv_product_inventories')
              .delete()
              .eq('product_id', productId);
              
            if (deleteError) {
              console.error(`❌ Error deleting inventories for product ${product.code}:`, deleteError);
              continue;
            }
            
            // Insert new inventories
            const { error: insertError, count: insertCount } = await supabase
              .from('kv_product_inventories')
              .insert(inventoryRows);
              
            if (insertError) {
              console.error(`❌ Error inserting inventories for product ${product.code}:`, insertError);
            } else {
              inventoryCount += inventoryRows.length;
            }
          }
        }
      }
    }
    
    console.log(`✅ Completed product sync: ${successCount} products, ${inventoryCount} inventories`);
    
    return {
      success: true,
      message: `Products synced successfully: ${successCount} products, ${inventoryCount} inventories`,
      count: {
        total: products.length,
        success: successCount,
        error: errorCount,
        inventories: inventoryCount
      }
    };
  } catch (error) {
    console.error("❌ Error in product sync:", error);
    throw error;
  }
}

/**
 * Fetch and clone customers from KiotViet API to Supabase
 * @returns {Promise<Object>} Results of the operation
 */
async function cloneCustomers() {
  try {
    console.log("🔄 Starting customer clone process");
    
    // Fetch customers from KiotViet API
    const customers = await fetchAllPages('/customers', { 
      includeRemoveIds: true
    });
    
    if (customers.length === 0) {
      return { success: true, message: "No customers found to clone", count: 0 };
    }
    
    console.log(`👥 Processing ${customers.length} customers...`);
    
    // Process in batches
    const batchSize = 50;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, Math.min(i + batchSize, customers.length));
      
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(customers.length/batchSize)}`);
      
      const customerRows = [];
      
      for (const customer of batch) {
        try {
          // Map KiotViet customer data to our database structure based on the schema
          customerRows.push({
            kiotviet_id: customer.id,
            code: customer.code,
            name: customer.name,
            retailer_id: customer.retailerId,
            branch_id: customer.branchId,
            location_name: customer.locationName || '',
            ward_name: customer.wardName || '',
            modified_date: customer.modifiedDate ? new Date(customer.modifiedDate) : null,
            created_date: customer.createdDate ? new Date(customer.createdDate) : null,
            type: customer.type,
            groups: customer.groups || '',
            debt: customer.debt || 0,
            contact_number: customer.contactNumber || '',
            comments: customer.comments || '',
            address: customer.address || '',
            synced_at: new Date()
          });
          
          successCount++;
        } catch (error) {
          console.error(`❌ Error processing customer ${customer.code}:`, error.message);
          errorCount++;
        }
      }
      
      if (customerRows.length > 0) {
        // Upsert customers to kv_customers table
        const { error } = await supabase
          .from('kv_customers')
          .upsert(customerRows, { 
            onConflict: 'kiotviet_id',
            ignoreDuplicates: false
          });
          
        if (error) {
          console.error("❌ Error upserting customers:", error);
          errorCount += customerRows.length;
          successCount -= customerRows.length;
        }
      }
    }
    
    console.log(`✅ Completed customer clone: ${successCount} customers processed, ${errorCount} errors`);
    
    return {
      success: true,
      message: `Customers cloned successfully: ${successCount} processed, ${errorCount} errors`,
      count: {
        total: customers.length,
        success: successCount,
        error: errorCount
      }
    };
  } catch (error) {
    console.error("❌ Error in customer clone:", error);
    throw error;
  }
}

/**
 * Fetch and clone invoices for a specific month from KiotViet API
 * @param {number|string} year - The year (e.g., 2023)
 * @param {number|string} month - The month (1-12)
 * @returns {Promise<Object>} Results of the operation
 */
async function cloneInvoicesByMonth(year, month) {
  try {
    // Validate inputs
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new Error('Invalid year or month');
    }
    
    console.log(`🔄 Starting invoice clone process for ${yearNum}/${monthNum}`);
    
    // Format month with leading zero if needed
    const monthStr = monthNum.toString().padStart(2, '0');
    
    // Create date range for the month
    const startDate = `${yearNum}-${monthStr}-01`;
    // Calculate the last day of the month
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const endDate = `${yearNum}-${monthStr}-${lastDay}`;
    
    // Fetch invoices from KiotViet API
    const invoices = await fetchAllPages('/invoices', { 
      fromPurchaseDate: startDate,
      toPurchaseDate: endDate,
      includeInvoiceDetails: true
    });
    
    if (invoices.length === 0) {
      return { 
        success: true, 
        message: `No invoices found for ${yearNum}/${monthStr}`, 
        count: 0 
      };
    }
    
    console.log(`🧾 Processing ${invoices.length} invoices...`);
    
    // Process in batches
    const batchSize = 25;
    let successCount = 0;
    let errorCount = 0;
    let detailsCount = 0;
    
    for (let i = 0; i < invoices.length; i += batchSize) {
      const batch = invoices.slice(i, Math.min(i + batchSize, invoices.length));
      
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(invoices.length/batchSize)}`);
      
      // Process invoices in current batch
      for (const invoice of batch) {
        try {
          // Map KiotViet invoice data to our database structure
          const invoiceData = {
            kiotviet_id: invoice.id,
            uuid: invoice.uuid || null,
            code: invoice.code,
            purchase_date: invoice.purchaseDate ? new Date(invoice.purchaseDate) : null,
            branch_id: invoice.branchId,
            branch_name: invoice.branchName || '',
            sold_by_id: invoice.soldById || null,
            sold_by_name: invoice.soldByName || '',
            kiotviet_customer_id: invoice.customerId || null,
            customer_code: invoice.customerCode || '',
            customer_name: invoice.customerName || '',
            order_code: invoice.orderCode || '',
            total: invoice.total || 0,
            total_payment: invoice.totalPayment || 0,
            status: invoice.status || null,
            status_value: invoice.statusValue || '',
            using_cod: invoice.usingCod || false,
            created_date: invoice.createdDate ? new Date(invoice.createdDate) : null,
            synced_at: new Date()
          };
          
          // Insert or update invoice
          const { data: savedInvoice, error: invoiceError } = await supabase
            .from('kv_invoices')
            .upsert([invoiceData], { 
              onConflict: 'kiotviet_id',
              ignoreDuplicates: false
            })
            .select();
            
          if (invoiceError) {
            console.error(`❌ Error upserting invoice ${invoice.code}:`, invoiceError);
            errorCount++;
            continue;
          }
          
          // Process invoice details if available
          if (invoice.invoiceDetails && Array.isArray(invoice.invoiceDetails) && savedInvoice && savedInvoice.length > 0) {
            const invoiceId = savedInvoice[0].id;
            
            // Delete existing details for this invoice
            const { error: deleteError } = await supabase
              .from('kv_invoice_details')
              .delete()
              .eq('invoice_id', invoiceId);
              
            if (deleteError) {
              console.error(`❌ Error deleting invoice details for invoice ${invoice.code}:`, deleteError);
              continue;
            }
            
            // Prepare details for batch insert
            const detailsData = invoice.invoiceDetails.map(detail => ({
              invoice_id: invoiceId,
              kiotviet_product_id: detail.productId,
              product_code: detail.productCode || '',
              product_name: detail.productName || '',
              category_id: detail.categoryId || null,
              category_name: detail.categoryName || '',
              quantity: detail.quantity || 0,
              price: detail.price || 0,
              discount: detail.discount || 0,
              sub_total: detail.subTotal || 0,
              note: detail.note || '',
              serial_numbers: detail.serialNumbers || '',
              return_quantity: detail.returnQuantity || 0,
              synced_at: new Date()
            }));
            
            if (detailsData.length > 0) {
              // Insert new details
              const { error: detailsError } = await supabase
                .from('kv_invoice_details')
                .insert(detailsData);
                
              if (detailsError) {
                console.error(`❌ Error inserting details for invoice ${invoice.code}:`, detailsError);
              } else {
                detailsCount += detailsData.length;
              }
            }
          }
          
          successCount++;
        } catch (error) {
          console.error(`❌ Error processing invoice ${invoice.code}:`, error.message);
          errorCount++;
        }
      }
    }
    
    console.log(`✅ Completed invoice clone: ${successCount} invoices, ${detailsCount} details, ${errorCount} errors`);
    
    return {
      success: true,
      message: `Invoices for ${yearNum}/${monthStr} cloned successfully`,
      count: {
        total: invoices.length,
        success: successCount,
        error: errorCount,
        details: detailsCount
      }
    };
  } catch (error) {
    console.error("❌ Error in invoice clone:", error);
    throw error;
  }
}

/**
 * Fetch and clone invoices for a specific day from KiotViet API
 * @param {number|string} year - The year (e.g., 2023)
 * @param {number|string} month - The month (1-12)
 * @param {number|string} day - The day (1-31)
 * @returns {Promise<Object>} Results of the operation
 */
async function cloneInvoicesByDay(year, month, day) {
  try {
    // Validate inputs
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    
    if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) {
      throw new Error('Invalid year, month, or day');
    }
    
    // Format date parts with leading zeros if needed
    const monthStr = monthNum.toString().padStart(2, '0');
    const dayStr = dayNum.toString().padStart(2, '0');
    
    // Create date string for the specific day (YYYY-MM-DD)
    const dateStr = `${yearNum}-${monthStr}-${dayStr}`;
    
    console.log(`🔄 Starting invoice clone process for ${dateStr}`);
    
    // Fetch invoices from KiotViet API for the specific day
    const invoices = await fetchAllPages('/invoices', { 
      fromPurchaseDate: dateStr,
      toPurchaseDate: dateStr,
      includeInvoiceDetails: true
    });
    
    if (invoices.length === 0) {
      return { 
        success: true, 
        message: `No invoices found for ${dateStr}`, 
        count: 0 
      };
    }
    
    console.log(`🧾 Processing ${invoices.length} invoices for ${dateStr}...`);
    
    // Process in batches
    const batchSize = 25;
    let successCount = 0;
    let errorCount = 0;
    let detailsCount = 0;
    
    for (let i = 0; i < invoices.length; i += batchSize) {
      const batch = invoices.slice(i, Math.min(i + batchSize, invoices.length));
      
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(invoices.length/batchSize)}`);
      
      // Process invoices in current batch
      for (const invoice of batch) {
        try {
          // Map KiotViet invoice data to our database structure
          const invoiceData = {
            kiotviet_id: invoice.id,
            uuid: invoice.uuid || null,
            code: invoice.code,
            purchase_date: invoice.purchaseDate ? new Date(invoice.purchaseDate) : null,
            branch_id: invoice.branchId,
            branch_name: invoice.branchName || '',
            sold_by_id: invoice.soldById || null,
            sold_by_name: invoice.soldByName || '',
            kiotviet_customer_id: invoice.customerId || null,
            customer_code: invoice.customerCode || '',
            customer_name: invoice.customerName || '',
            order_code: invoice.orderCode || '',
            total: invoice.total || 0,
            total_payment: invoice.totalPayment || 0,
            status: invoice.status || null,
            status_value: invoice.statusValue || '',
            using_cod: invoice.usingCod || false,
            created_date: invoice.createdDate ? new Date(invoice.createdDate) : null,
            synced_at: new Date()
          };
          
          // Insert or update invoice
          const { data: savedInvoice, error: invoiceError } = await supabase
            .from('kv_invoices')
            .upsert([invoiceData], { 
              onConflict: 'kiotviet_id',
              ignoreDuplicates: false
            })
            .select();
            
          if (invoiceError) {
            console.error(`❌ Error upserting invoice ${invoice.code}:`, invoiceError);
            errorCount++;
            continue;
          }
          
          // Process invoice details if available
          if (invoice.invoiceDetails && Array.isArray(invoice.invoiceDetails) && savedInvoice && savedInvoice.length > 0) {
            const invoiceId = savedInvoice[0].id;
            
            // Delete existing details for this invoice
            const { error: deleteError } = await supabase
              .from('kv_invoice_details')
              .delete()
              .eq('invoice_id', invoiceId);
              
            if (deleteError) {
              console.error(`❌ Error deleting invoice details for invoice ${invoice.code}:`, deleteError);
              continue;
            }
            
            // Prepare details for batch insert
            const detailsData = invoice.invoiceDetails.map(detail => ({
              invoice_id: invoiceId,
              kiotviet_product_id: detail.productId,
              product_code: detail.productCode || '',
              product_name: detail.productName || '',
              category_id: detail.categoryId || null,
              category_name: detail.categoryName || '',
              quantity: detail.quantity || 0,
              price: detail.price || 0,
              discount: detail.discount || 0,
              sub_total: detail.subTotal || 0,
              note: detail.note || '',
              serial_numbers: detail.serialNumbers || '',
              return_quantity: detail.returnQuantity || 0,
              synced_at: new Date()
            }));
            
            if (detailsData.length > 0) {
              // Insert new details
              const { error: detailsError } = await supabase
                .from('kv_invoice_details')
                .insert(detailsData);
                
              if (detailsError) {
                console.error(`❌ Error inserting details for invoice ${invoice.code}:`, detailsError);
              } else {
                detailsCount += detailsData.length;
              }
            }
          }
          
          successCount++;
        } catch (error) {
          console.error(`❌ Error processing invoice ${invoice.code}:`, error.message);
          errorCount++;
        }
      }
    }
    
    console.log(`✅ Completed invoice clone for ${dateStr}: ${successCount} invoices, ${detailsCount} details, ${errorCount} errors`);
    
    return {
      success: true,
      message: `Invoices for ${dateStr} cloned successfully`,
      count: {
        total: invoices.length,
        success: successCount,
        error: errorCount,
        details: detailsCount
      }
    };
  } catch (error) {
    console.error("❌ Error in invoice clone by day:", error);
    throw error;
  }
}

module.exports = {
  getKiotVietToken,
  getKiotVietHeaders,
  fetchAllPages,
  cloneProducts,
  cloneCustomers,
  cloneInvoicesByMonth,
  cloneInvoicesByDay
}; 