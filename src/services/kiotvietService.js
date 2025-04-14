const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Get KiotViet token from Supabase
 */
async function getKiotVietToken() {
  const { data, error } = await supabase
    .from("system")
    .select("value")
    .eq("title", "kiotviet")
    .limit(1)
    .single();

  if (error) {
    console.error("❌ Error fetching KiotViet token from system table:", error);
    throw error;
  }

  return data.value;
}

/**
 * Fetch products from KiotViet API
 */
async function fetchProducts(token) {
  const { data } = await axios.get(
    `${process.env.KIOTVIET_BASE_URL}/products`,
    {
      headers: {
        Retailer: "gaolamthuy",
        Authorization: `Bearer ${token}`,
      },
      params: {
        pageSize: 100,
        includeInventory: true,
      },
    }
  );

  return data.data;
}

/**
 * Fetch customers from KiotViet API with pagination
 */
async function fetchCustomers(token) {
  const allCustomers = [];
  let currentItem = 0;
  const pageSize = 100;
  let totalCustomers = 0;

  do {
    const { data } = await axios.get(
      `${process.env.KIOTVIET_BASE_URL}/customers`,
      {
        headers: {
          Retailer: "gaolamthuy",
          Authorization: `Bearer ${token}`,
        },
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          includeCustomerGroup: true,
        },
      }
    );

    // Add the fetched customers to the allCustomers array
    allCustomers.push(...data.data);
    totalCustomers = data.total; // Get the total number of customers
    currentItem += pageSize; // Move to the next page
  } while (currentItem < totalCustomers);

  return allCustomers;
}

/**
 * Import products into Supabase
 */
async function importProducts(products) {
  console.log("🚀 Starting product import...");

  // Clean tables
  await supabase.from("kiotviet_inventories").delete().neq("id", 0);
  await supabase.from("kiotviet_products").delete().neq("id", 0);
  console.log("✅ Tables cleared");

  // Prepare arrays
  const productRecords = [];

  for (const product of products) {
    productRecords.push({
      kiotviet_id: product.id,
      retailer_id: product.retailerId,
      code: product.code,
      bar_code: product.barCode || "",
      name: product.name,
      full_name: product.fullName,
      category_id: product.categoryId,
      category_name: product.categoryName,
      allows_sale: product.allowsSale,
      type: product.type,
      has_variants: product.hasVariants,
      base_price: product.basePrice,
      weight: product.weight,
      unit: product.unit,
      master_product_id: product.masterProductId || null,
      master_unit_id: product.masterUnitId || null,
      conversion_value: product.conversionValue,
      description: product.description || "",
      modified_date: product.modifiedDate,
      created_date: product.createdDate,
      is_active: product.isActive,
      order_template: product.orderTemplate || "",
      is_lot_serial_control: product.isLotSerialControl,
      is_batch_expire_control: product.isBatchExpireControl,
      trade_mark_name: product.tradeMarkName || "",
      trade_mark_id: product.tradeMarkId || null,
      images: product.images ? product.images : [],
    });
  }

  // Insert products
  const { error: productError } = await supabase
    .from("kiotviet_products")
    .insert(productRecords);
    
  if (productError) {
    console.error("❌ Error inserting products:", productError);
    throw productError;
  }

  console.log(`✅ Inserted ${productRecords.length} products`);
  
  return {
    productsCount: productRecords.length
  };
}

/**
 * Import customers into Supabase
 */
async function importCustomers(customers) {
  console.log("🚀 Starting customer import...");

  // Clean table
  await supabase.from("kiotviet_customers").delete().neq("id", 0);
  console.log("✅ Customers table cleared");

  // Prepare customer records
  const customerRecords = customers.map(customer => ({
    kiotviet_id: customer.id,
    code: customer.code,
    name: customer.name,
    retailer_id: customer.retailerId,
    branch_id: customer.branchId,
    location_name: customer.locationName || "",
    ward_name: customer.wardName || "",
    modified_date: customer.modifiedDate,
    created_date: customer.createdDate,
    type: customer.type || null,
    groups: customer.groups || null,
    debt: customer.debt || 0,
    contact_number: customer.contactNumber || "",
    comments: customer.comments || ""
  }));

  // Remove duplicates based on kiotviet_id
  const uniqueCustomerRecords = Array.from(new Map(customerRecords.map(item => [item.kiotviet_id, item])).values());

  // Insert customers
  const { error } = await supabase
    .from("kiotviet_customers")
    .insert(uniqueCustomerRecords);
    
  if (error) {
    console.error("❌ Error inserting customers:", error);
    throw error;
  }

  console.log(`✅ Inserted ${uniqueCustomerRecords.length} customers`);
  
  return {
    customersCount: uniqueCustomerRecords.length
  };
}

/**
 * Fetch invoices from KiotViet API for a specific date range
 */
async function fetchInvoicesForDateRange(startDate, endDate, pageSize = 100, currentItem = 0) {
  try {
    // Get token from the system table
    const token = await getKiotVietToken();
    
    const response = await axios.get(`${process.env.KIOTVIET_BASE_URL}/invoices`, {
      params: {
        includePayment: true,
        pageSize: pageSize,
        currentItem: currentItem,
        fromPurchaseDate: startDate,
        toPurchaseDate: endDate
      },
      headers: {
        'Retailer': 'gaolamthuy',
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching invoices:', error);
    throw error;
  }
}

/**
 * Save a KiotViet invoice to Supabase
 */
async function saveInvoiceToSupabase(invoice, logEnabled = false) {
  try {
    if (logEnabled) {
      console.log(`🔍 Processing invoice: ${invoice.code} (KiotViet ID: ${invoice.id})`);
    }
    
    // Check if the customer exists in our database
    let localCustomerId = null;
    if (invoice.customerId) {
      // Check if customer exists by KiotViet ID
      const { data: customerData } = await supabase
        .from('kiotviet_customers')
        .select('id')
        .eq('kiotviet_id', invoice.customerId)
        .single();
      
      if (customerData) {
        localCustomerId = customerData.id;
        if (logEnabled) {
          console.log(`✅ Found customer with ID: ${localCustomerId}`);
        }
      }
    }
    
    // Insert new invoice 
    const { data: newInvoice, error: insertError } = await supabase
      .from('kiotviet_invoices')
      .insert([{
        kiotviet_id: invoice.id,
        uuid: invoice.uuid,
        code: invoice.code,
        purchase_date: invoice.purchaseDate,
        branch_id: invoice.branchId,
        branch_name: invoice.branchName,
        sold_by_id: invoice.soldById,
        sold_by_name: invoice.soldByName,
        kiotviet_customer_id: invoice.customerId,
        customer_id: localCustomerId,
        customer_code: invoice.customerCode,
        customer_name: invoice.customerName,
        order_code: invoice.orderCode,
        total: invoice.total,
        total_payment: invoice.totalPayment,
        status: invoice.status,
        status_value: invoice.statusValue,
        using_cod: invoice.usingCod,
        created_date: invoice.createdDate
      }])
      .select('id')
      .single();
    
    if (insertError) throw insertError;
    const invoiceId = newInvoice.id;

    // Process invoice details
    if (invoice.invoiceDetails && invoice.invoiceDetails.length > 0) {
      // Get all product_ids by kiotviet_ids
      const kiotvietProductIds = invoice.invoiceDetails.map(detail => detail.productId);
      
      const { data: productsData } = await supabase
        .from('kiotviet_products')
        .select('id, kiotviet_id')
        .in('kiotviet_id', kiotvietProductIds);
      
      // Create a mapping from kiotviet_id to local id
      const productIdMap = {};
      if (productsData) {
        productsData.forEach(product => {
          productIdMap[product.kiotviet_id] = product.id;
        });
      }
      
      // Create invoice details array
      const detailsArray = invoice.invoiceDetails.map(detail => ({
        invoice_id: invoiceId,
        kiotviet_product_id: detail.productId,
        product_id: productIdMap[detail.productId] || null,
        product_code: detail.productCode,
        product_name: detail.productName,
        category_id: detail.categoryId,
        category_name: detail.categoryName,
        quantity: detail.quantity,
        price: detail.price,
        discount: detail.discount,
        sub_total: detail.subTotal,
        note: detail.note,
        serial_numbers: detail.serialNumbers,
        return_quantity: detail.returnQuantity
      }));
      
      const { error: detailsError } = await supabase
        .from('kiotviet_invoice_details')
        .insert(detailsArray);

      if (detailsError) {
        throw detailsError;
      }
    }

    // Process payments
    if (invoice.payments && invoice.payments.length > 0) {
      const paymentsArray = invoice.payments.map(payment => ({
        kiotviet_payment_id: payment.id,
        invoice_id: invoiceId,
        code: payment.code,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        status_value: payment.statusValue,
        trans_date: payment.transDate
      }));
      
      const { error: paymentsError } = await supabase
        .from('kiotviet_invoice_payments')
        .insert(paymentsArray);

      if (paymentsError) {
        throw paymentsError;
      }
    }

    return { id: invoiceId };
  } catch (error) {
    console.error(`❌ Lỗi xử lý hóa đơn ${invoice.code}: ${error.message}`);
    throw error;
  }
}

/**
 * Clone KiotViet invoices for a specific year
 */
async function cloneInvoicesForYear(year) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  try {
    // First, clean up existing data for the year to avoid duplicates
    const startOfYear = new Date(year, 0, 1).toISOString();
    const endOfYear = new Date(year, 11, 31, 23, 59, 59).toISOString();
    
    console.log(`🧹 Xóa dữ liệu hóa đơn hiện có cho năm ${year}...`);
    
    // Get all invoice IDs for the year
    const { data: existingInvoices } = await supabase
      .from('kiotviet_invoices')
      .select('id')
      .gte('purchase_date', startOfYear)
      .lte('purchase_date', endOfYear);
    
    if (existingInvoices && existingInvoices.length > 0) {
      const invoiceIds = existingInvoices.map(inv => inv.id);
      console.log(`🗑️ Tìm thấy ${invoiceIds.length} hóa đơn cũ, đang xóa...`);
      
      // Delete all invoice details and payments first (cascade doesn't always work reliably)
      await supabase
        .from('kiotviet_invoice_details')
        .delete()
        .in('invoice_id', invoiceIds);
        
      await supabase
        .from('kiotviet_invoice_payments')
        .delete()
        .in('invoice_id', invoiceIds);
      
      // Then delete the invoices
      await supabase
        .from('kiotviet_invoices')
        .delete()
        .in('id', invoiceIds);
      
      console.log(`✅ Đã xóa ${invoiceIds.length} hóa đơn cũ`);
    } else {
      console.log(`ℹ️ Không tìm thấy hóa đơn nào cho năm ${year}`);
    }
  } catch (error) {
    console.error(`❌ Lỗi khi xóa dữ liệu cũ: ${error.message}`);
  }

  // Initialize counters for progress tracking
  let totalInvoicesProcessed = 0;
  let totalInvoicesExpected = 0;
  const MAX_DETAILED_LOGS = 10; // Only show detailed logs for first 10 invoices
  
  // Process each month
  for (let month = 1; month <= 12; month++) {
    const monthName = new Date(year, month - 1, 1).toLocaleString('vi-VN', { month: 'long' });
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
    
    try {
      let hasMoreData = true;
      let currentItem = 0;
      const pageSize = 100;
      const maxFailures = 5; // Maximum number of consecutive failures before stopping
      let consecutiveFailures = 0;
      
      console.log(`\n🔄 Đang xử lý hóa đơn tháng ${month} (${monthName}) năm ${year}`);
      
      // Get total count for this month first
      const initialResponse = await fetchInvoicesForDateRange(startDate, endDate, 1, 0);
      const monthTotalInvoices = initialResponse.total || 0;
      totalInvoicesExpected += monthTotalInvoices;
      
      console.log(`📊 Tháng ${month}: ${monthTotalInvoices} hóa đơn cần xử lý`);
      
      // Skip if no invoices for this month
      if (monthTotalInvoices === 0) {
        console.log(`  ℹ️ Không có hóa đơn nào trong tháng ${month}, bỏ qua...`);
        continue;
      }
      
      let monthProcessedCount = 0;
      
      while (hasMoreData) {
        const response = await fetchInvoicesForDateRange(startDate, endDate, pageSize, currentItem);
        
        if (response.data.length === 0) {
          console.log(`  ℹ️ Không còn hóa đơn nào, chuyển sang tháng tiếp theo`);
          break;
        }
        
        console.log(`  💼 Đang xử lý ${currentItem+1} đến ${Math.min(currentItem+pageSize, monthTotalInvoices)}/${monthTotalInvoices} hóa đơn`);
        
        for (const [index, invoice] of response.data.entries()) {
          try {
            // Only log details for the first few invoices
            const shouldLog = totalInvoicesProcessed < MAX_DETAILED_LOGS;
            await saveInvoiceToSupabase(invoice, shouldLog);
            results.success++;
            monthProcessedCount++;
            totalInvoicesProcessed++;
            consecutiveFailures = 0; // Reset failure counter on success
            
            // Show progress every 10 invoices
            if (totalInvoicesProcessed % 10 === 0) {
              const progress = ((totalInvoicesProcessed / totalInvoicesExpected) * 100).toFixed(1);
              console.log(`  📈 Tiến độ: ${totalInvoicesProcessed}/${totalInvoicesExpected} (${progress}%), Tháng ${month}: ${monthProcessedCount}/${monthTotalInvoices}`);
            }
          } catch (error) {
            results.failed++;
            consecutiveFailures++;
            
            results.errors.push({
              invoice_id: invoice.id,
              code: invoice.code,
              error: error.message
            });
            
            // Stop processing if too many consecutive failures
            if (consecutiveFailures >= maxFailures) {
              console.error(`❌ Đã xảy ra ${maxFailures} lỗi liên tiếp, sẽ chuyển sang batch tiếp theo`);
              break;
            }
          }
        }
        
        // Update pagination logic: check if we've processed all items
        currentItem += pageSize;
        hasMoreData = currentItem < response.total;
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`✅ Hoàn thành xử lý ${monthProcessedCount}/${monthTotalInvoices} hóa đơn tháng ${month} năm ${year}`);
    } catch (error) {
      console.error(`❌ Lỗi xử lý tháng ${month} năm ${year}: ${error.message}`);
      results.errors.push({
        month,
        year,
        error: error.message
      });
    }
  }

  console.log(`\n=================================`);
  console.log(`🎉 KẾT QUẢ CLONE HOÁ ĐƠN NĂM ${year}:`);
  console.log(`✅ Thành công: ${results.success}/${totalInvoicesExpected} hóa đơn`);
  console.log(`❌ Thất bại: ${results.failed} hóa đơn`);
  
  if (results.errors.length > 0) {
    console.log(`\n⚠️ Đã xảy ra ${results.errors.length} lỗi trong quá trình xử lý`);
    console.log(`⚠️ 5 lỗi đầu tiên:`);
    results.errors.slice(0, 5).forEach(err => {
      if (err.month) {
        console.log(`   - Lỗi tháng ${err.month}: ${err.error}`);
      } else {
        console.log(`   - Hóa đơn ${err.code || err.invoice_id}: ${err.error}`);
      }
    });
  }
  
  return results;
}

/**
 * Clone KiotViet invoices for a specific month in a year
 */
async function cloneInvoicesForMonth(year, month) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  try {
    // Validate input
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new Error(`Năm ${year} hoặc tháng ${month} không hợp lệ`);
    }
    
    const monthName = new Date(yearNum, monthNum - 1, 1).toLocaleString('vi-VN', { month: 'long' });
    const startDate = new Date(yearNum, monthNum - 1, 1).toISOString();
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59).toISOString();
    
    console.log(`\n=================================`);
    console.log(`🧹 Xóa dữ liệu hóa đơn hiện có cho tháng ${monthNum} (${monthName}) năm ${yearNum}...`);
    
    // Get all invoice IDs for the specific month
    const { data: existingInvoices } = await supabase
      .from('kiotviet_invoices')
      .select('id')
      .gte('purchase_date', startDate)
      .lte('purchase_date', endDate);
    
    if (existingInvoices && existingInvoices.length > 0) {
      const invoiceIds = existingInvoices.map(inv => inv.id);
      console.log(`🗑️ Tìm thấy ${invoiceIds.length} hóa đơn cũ, đang xóa...`);
      
      // Delete all invoice details and payments first
      await supabase
        .from('kiotviet_invoice_details')
        .delete()
        .in('invoice_id', invoiceIds);
        
      await supabase
        .from('kiotviet_invoice_payments')
        .delete()
        .in('invoice_id', invoiceIds);
      
      // Then delete the invoices
      await supabase
        .from('kiotviet_invoices')
        .delete()
        .in('id', invoiceIds);
      
      console.log(`✅ Đã xóa ${invoiceIds.length} hóa đơn cũ`);
    } else {
      console.log(`ℹ️ Không tìm thấy hóa đơn nào cho tháng ${monthNum} năm ${yearNum}`);
    }

    // Initialize counters for progress tracking
    let totalInvoicesProcessed = 0;
    const MAX_DETAILED_LOGS = 10; // Only show detailed logs for first 10 invoices
    
    // Get total count for this month first
    const initialResponse = await fetchInvoicesForDateRange(startDate, endDate, 1, 0);
    const totalInvoices = initialResponse.total || 0;
    
    console.log(`\n🔄 Đang xử lý hóa đơn tháng ${monthNum} (${monthName}) năm ${yearNum}`);
    console.log(`📊 Tổng cộng: ${totalInvoices} hóa đơn cần xử lý`);
    
    // Skip if no invoices for this month
    if (totalInvoices === 0) {
      console.log(`  ℹ️ Không có hóa đơn nào trong tháng ${monthNum}, bỏ qua...`);
      return results;
    }
    
    let hasMoreData = true;
    let currentItem = 0;
    const pageSize = 100;
    const maxFailures = 5; // Maximum number of consecutive failures before stopping
    let consecutiveFailures = 0;
    let monthProcessedCount = 0;
    
    while (hasMoreData) {
      const response = await fetchInvoicesForDateRange(startDate, endDate, pageSize, currentItem);
      
      if (response.data.length === 0) {
        console.log(`  ℹ️ Không còn hóa đơn nào, kết thúc xử lý`);
        break;
      }
      
      console.log(`  💼 Đang xử lý ${currentItem+1} đến ${Math.min(currentItem+pageSize, totalInvoices)}/${totalInvoices} hóa đơn`);
      
      for (const [index, invoice] of response.data.entries()) {
        try {
          // Only log details for the first few invoices
          const shouldLog = totalInvoicesProcessed < MAX_DETAILED_LOGS;
          await saveInvoiceToSupabase(invoice, shouldLog);
          results.success++;
          monthProcessedCount++;
          totalInvoicesProcessed++;
          consecutiveFailures = 0; // Reset failure counter on success
          
          // Show progress every 10 invoices
          if (totalInvoicesProcessed % 10 === 0) {
            const progress = ((totalInvoicesProcessed / totalInvoices) * 100).toFixed(1);
            console.log(`  📈 Tiến độ: ${totalInvoicesProcessed}/${totalInvoices} (${progress}%)`);
          }
        } catch (error) {
          results.failed++;
          consecutiveFailures++;
          
          results.errors.push({
            invoice_id: invoice.id,
            code: invoice.code,
            error: error.message
          });
          
          // Stop processing if too many consecutive failures
          if (consecutiveFailures >= maxFailures) {
            console.error(`❌ Đã xảy ra ${maxFailures} lỗi liên tiếp, sẽ chuyển sang batch tiếp theo`);
            break;
          }
        }
      }
      
      // Update pagination logic: check if we've processed all items
      currentItem += pageSize;
      hasMoreData = currentItem < response.total;
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ Hoàn thành xử lý ${monthProcessedCount}/${totalInvoices} hóa đơn tháng ${monthNum} năm ${yearNum}`);
    
    console.log(`\n=================================`);
    console.log(`🎉 KẾT QUẢ CLONE HOÁ ĐƠN THÁNG ${monthNum} NĂM ${yearNum}:`);
    console.log(`✅ Thành công: ${results.success}/${totalInvoices} hóa đơn`);
    console.log(`❌ Thất bại: ${results.failed} hóa đơn`);
    
    if (results.errors.length > 0) {
      console.log(`\n⚠️ Đã xảy ra ${results.errors.length} lỗi trong quá trình xử lý`);
      console.log(`⚠️ 5 lỗi đầu tiên:`);
      results.errors.slice(0, 5).forEach(err => {
        console.log(`   - Hóa đơn ${err.code || err.invoice_id}: ${err.error}`);
      });
    }
    
  } catch (error) {
    console.error(`❌ Lỗi: ${error.message}`);
    results.errors.push({
      error: error.message
    });
  }
  
  return results;
}

module.exports = {
  getKiotVietToken,
  fetchProducts,
  fetchCustomers,
  importProducts,
  importCustomers,
  fetchInvoicesForDateRange,
  saveInvoiceToSupabase,
  cloneInvoicesForYear,
  cloneInvoicesForMonth
}; 