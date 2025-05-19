/**
 * KiotViet Service
 * Handles the actual API calls and data processing for KiotViet integration
 */

const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// KiotViet API Configuration
const KV_RETAILER = process.env.KIOTVIET_RETAILER;
const KV_API_URL = process.env.KIOTVIET_PUBLIC_API_URL;

/**
 * Refresh and store KiotViet access token into `system` table
 */
async function refreshKiotVietToken() {
  try {
    const response = await axios.post(
      process.env.KIOTVIET_TOKEN_REFRESH_URL,
      new URLSearchParams({
        scopes: "PublicApi.Access",
        grant_type: "client_credentials",
        client_id: process.env.KIOTVIET_CLIENT_ID,
        client_secret: process.env.KIOTVIET_CLIENT_SECRET,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = response.data;

    if (!access_token) {
      throw new Error("No access_token returned from KiotViet");
    }

    const tokenData = access_token;

    const { error } = await supabase.from("system").upsert(
      [
        {
          title: "kiotviet",
          value: tokenData,
          updated_at: new Date().toISOString(),
        },
      ],
      {
        onConflict: "title",
      }
    );

    if (error) {
      throw new Error(
        `Failed to store token in system table: ${error.message}`
      );
    }

    console.log("✅ KiotViet token refreshed and saved.");
    return tokenData;
  } catch (error) {
    console.error("❌ Failed to refresh KiotViet token:", error.message);
    throw error;
  }
}

/**
 * Get KiotViet authentication token from Supabase
 * @returns {Promise<string>} The authentication token
 */
async function getKiotVietToken() {
  try {
    // Get token directly from system table
    const { data, error } = await supabase
      .from("system")
      .select("value")
      .eq("title", "kiotviet")
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
    if (typeof data.value === "string") {
      // Token is stored directly as a string
      console.log("Using KiotViet token from system table (stored as string)");
      return data.value;
    } else if (typeof data.value === "object" && data.value.token) {
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
    Retailer: KV_RETAILER,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
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
      console.log(
        `📄 Fetching ${endpoint} - Page ${currentPage} (${allResults.length} items so far)`
      );

      const response = await axios.get(`${KV_API_URL}${endpoint}`, {
        headers,
        params: {
          ...params,
          pageSize,
          currentItem: (currentPage - 1) * pageSize,
        },
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
 * Fetch and save products from KiotViet API with pricebook support
 * @returns {Promise<Object>} Results of the operation
 */
async function cloneProducts() {
  try {
    console.log("🔄 Starting product sync process with pricebook support");

    // Ensure default customer group exists
    const { error: groupError } = await supabase
      .from("kv_customer_groups")
      .upsert(
        {
          name: "",
          description: "Default customer group",
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          onConflict: "name",
        }
      );

    if (groupError) {
      console.error(
        "❌ Error ensuring default customer group exists:",
        groupError
      );
      throw new Error("Failed to ensure default customer group exists");
    }

    // Fetch products from KiotViet API with pricebook data
    const products = await fetchAllPages("/products", {
      pageSize: 100,
      includeInventory: true,
      includePricebook: true,
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
    let pricebookCount = 0;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, Math.min(i + batchSize, products.length));

      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          products.length / batchSize
        )}`
      );

      // Get the KiotViet IDs
      const kiotvietIds = batch.map((product) => product.id);

      // First fetch existing products to preserve glt_ fields
      const { data: existingProducts, error: fetchError } = await supabase
        .from("kv_products")
        .select("*")
        .in("kiotviet_id", kiotvietIds);

      if (fetchError) {
        console.error("❌ Error fetching existing products:", fetchError);
        errorCount += batch.length;
        continue;
      }

      // Create a map of existing products by kiotviet_id
      const existingProductsMap = {};
      for (const product of existingProducts || []) {
        existingProductsMap[product.kiotviet_id] = product;
      }

      const productRows = [];
      const pricebookRows = [];

      for (const product of batch) {
        try {
          // Get existing product data (if any)
          const existingProduct = existingProductsMap[product.id] || {};

          // Extract all glt_ prefixed fields from the existing product
          const gltFields = {};
          if (existingProduct) {
            Object.keys(existingProduct).forEach((key) => {
              if (key.startsWith("glt_")) {
                gltFields[key] = existingProduct[key];
              }
            });
          }

          // Map KiotViet product data to our database structure
          const productData = {
            // KiotViet fields
            kiotviet_id: product.id,
            retailer_id: product.retailerId,
            code: product.code,
            bar_code: product.barCode || "",
            name: product.name,
            full_name: product.fullName || product.name,
            category_id: product.categoryId,
            category_name: product.categoryName,
            allows_sale: product.allowsSale,
            has_variants: product.hasVariants,
            base_price: product.basePrice,
            weight: product.weight || null,
            unit: product.unit,
            master_product_id: product.masterProductId || null,
            master_unit_id: product.masterUnitId || null,
            conversion_value: product.conversionValue,
            description: product.description || "",
            modified_date: product.modifiedDate
              ? new Date(product.modifiedDate)
              : null,
            created_date: product.createdDate
              ? new Date(product.createdDate)
              : null,
            is_active: product.isActive,
            order_template: product.orderTemplate || "",
            is_lot_serial_control: product.isLotSerialControl || false,
            is_batch_expire_control: product.isBatchExpireControl || false,
            trade_mark_name: product.tradeMarkName || "",
            trade_mark_id: product.tradeMarkId || null,
            images: product.images || [],

            // Default values for glt fields if not present in existing record
            glt_synced_at: new Date(),
            glt_updated_at: new Date(),
          };

          // Merge all existing glt fields with the new data, preserving their values
          productRows.push({
            ...productData,
            ...gltFields,
          });

          // Collect unique pricebooks
          const uniquePricebooks = new Set();
          if (product.priceBooks && Array.isArray(product.priceBooks)) {
            for (const pricebook of product.priceBooks) {
              if (pricebook.isActive) {
                // Get customer group name from the pricebook
                const { data: pricebookData } = await supabase
                  .from("kv_pricebooks")
                  .select("customer_group_name")
                  .eq("id", pricebook.priceBookId)
                  .single();

                const customerGroupName =
                  pricebookData?.customer_group_name || "default";

                uniquePricebooks.add(
                  JSON.stringify({
                    id: pricebook.priceBookId,
                    name: pricebook.priceBookName,
                    is_active: true,
                    is_global: true,
                    customer_group_name: customerGroupName,
                    created_at: new Date(),
                    updated_at: new Date(),
                    start_date: pricebook.startDate
                      ? new Date(pricebook.startDate)
                      : null,
                    end_date: pricebook.endDate
                      ? new Date(pricebook.endDate)
                      : null,
                  })
                );
              }
            }
          }

          // Ensure pricebooks exist
          if (uniquePricebooks.size > 0) {
            const pricebookData = Array.from(uniquePricebooks).map((pb) =>
              JSON.parse(pb)
            );
            console.log(`Ensuring ${pricebookData.length} pricebooks exist`);

            const { error: pricebookError } = await supabase
              .from("kv_pricebooks")
              .upsert(pricebookData, {
                onConflict: "id",
                ignoreDuplicates: false,
              });

            if (pricebookError) {
              console.error("❌ Error upserting pricebooks:", pricebookError);
              console.error("Sample pricebook data:", pricebookData[0]);
            } else {
              console.log("✅ Successfully ensured pricebooks exist");
            }
          }

          // Process pricebook data if available
          if (product.priceBooks && Array.isArray(product.priceBooks)) {
            console.log(
              `Found ${product.priceBooks.length} pricebooks for product ${product.id}`
            );
            for (const pricebook of product.priceBooks) {
              // Skip inactive pricebooks
              if (!pricebook.isActive) {
                console.log(
                  `Skipping inactive pricebook ${pricebook.priceBookId}`
                );
                continue;
              }

              console.log(`Processing pricebook: ${JSON.stringify(pricebook)}`);

              // Get the existing product ID if it exists
              const { data: existingProduct } = await supabase
                .from("kv_products")
                .select("id")
                .eq("kiotviet_id", product.id)
                .single();

              if (!existingProduct) {
                console.log(
                  `No existing product found for KiotViet ID ${product.id}`
                );
                continue;
              }

              // Get customer group name from pricebook
              const { data: pricebookData } = await supabase
                .from("kv_pricebooks")
                .select("customer_group_name")
                .eq("id", pricebook.priceBookId)
                .single();

              const customerGroupName =
                pricebookData?.customer_group_name || "default";

              // First ensure the pricebook exists
              const pricebookUpsertData = {
                id: pricebook.priceBookId,
                name: pricebook.priceBookName,
                is_active: true,
                is_global: true,
                customer_group_name: customerGroupName,
                created_at: new Date(),
                updated_at: new Date(),
              };

              const { error: pricebookError } = await supabase
                .from("kv_pricebooks")
                .upsert([pricebookUpsertData], {
                  onConflict: "id",
                  ignoreDuplicates: false,
                });

              if (pricebookError) {
                console.error(
                  `❌ Error ensuring pricebook exists:`,
                  pricebookError
                );
                continue;
              }

              // Then add the product pricebook entry
              const productPricebookData = {
                pricebook_id: pricebook.priceBookId,
                pricebook_name: pricebook.priceBookName,
                customer_group_name: customerGroupName,
                product_id: existingProduct.id,
                product_kiotviet_id: product.id,
                price: pricebook.price,
                is_active: true,
                start_date: pricebook.startDate
                  ? new Date(pricebook.startDate)
                  : null,
                end_date: pricebook.endDate
                  ? new Date(pricebook.endDate)
                  : null,
                created_at: new Date(),
                updated_at: new Date(),
              };

              // Delete any existing entry
              const { error: deleteError } = await supabase
                .from("kv_product_pricebooks")
                .delete()
                .eq("product_id", existingProduct.id)
                .eq("pricebook_id", pricebook.priceBookId);

              if (deleteError) {
                console.error(
                  `❌ Error deleting existing product pricebook:`,
                  deleteError
                );
                continue;
              }

              // Insert new entry
              const { error: insertError } = await supabase
                .from("kv_product_pricebooks")
                .insert([productPricebookData]);

              if (insertError) {
                console.error(
                  `❌ Error inserting product pricebook:`,
                  insertError
                );
                console.error(`Data:`, productPricebookData);
              } else {
                pricebookCount++;
                console.log(
                  `✅ Added pricebook entry for product ${product.id}`
                );
              }
            }
          } else {
            console.log(`No pricebooks found for product ${product.id}`);
          }

          successCount++;
        } catch (error) {
          console.error(
            `❌ Error processing product ${product.code}:`,
            error.message
          );
          errorCount++;
        }
      }

      if (productRows.length > 0) {
        // Upsert products to kv_products table
        const { error } = await supabase
          .from("kv_products")
          .upsert(productRows, {
            onConflict: "kiotviet_id",
            ignoreDuplicates: false,
          });

        if (error) {
          console.error("❌ Error upserting products:", error);
          errorCount += productRows.length;
          successCount -= productRows.length;
          continue;
        }

        // Get product IDs mapping for pricebooks and inventories
        const { data: productMappings, error: mappingError } = await supabase
          .from("kv_products")
          .select("id, kiotviet_id")
          .in(
            "kiotviet_id",
            productRows.map((p) => p.kiotviet_id)
          );

        if (mappingError) {
          console.error("❌ Error getting product mappings:", mappingError);
          continue;
        }

        // Create a lookup map for product IDs
        const productIdMap = {};
        for (const mapping of productMappings) {
          productIdMap[mapping.kiotviet_id] = mapping.id;
        }

        // Process inventories for each product
        console.log(
          `📦 Processing inventories for ${productRows.length} products`
        );

        // Process inventories in batches
        for (const product of batch) {
          if (!product.inventories || !Array.isArray(product.inventories)) {
            continue;
          }

          const productId = productIdMap[product.id];
          if (!productId) {
            console.warn(
              `⚠️ Could not find database ID for product ${product.id} (${product.code})`
            );
            continue;
          }

          const inventoryRows = [];

          for (const inventory of product.inventories) {
            inventoryRows.push({
              product_id: productId,
              branch_id: inventory.branchId,
              branch_name: inventory.branchName,
              cost: inventory.cost,
              product_name: inventory.productName,
              on_hand: inventory.onHand || 0,
              on_sales: inventory.onHand || 0,
              reserved: inventory.reserved || 0,
              minimum_inventory: inventory.minQuantity || 0,
              last_sync: new Date(),
              synced_at: new Date(),
            });
          }

          if (inventoryRows.length > 0) {
            // Delete existing inventories for this product
            const { error: deleteError } = await supabase
              .from("kv_product_inventories")
              .delete()
              .eq("product_id", productId);

            if (deleteError) {
              console.error(
                `❌ Error deleting inventories for product ${product.code}:`,
                deleteError
              );
              continue;
            }

            // Insert new inventories
            const { error: insertError, count: insertCount } = await supabase
              .from("kv_product_inventories")
              .insert(inventoryRows);

            if (insertError) {
              console.error(
                `❌ Error inserting inventories for product ${product.code}:`,
                insertError
              );
            } else {
              inventoryCount += insertCount;
            }
          }
        }
      }
    }

    console.log(
      `✅ Completed product sync: ${successCount} products, ${inventoryCount} inventories, ${pricebookCount} pricebook entries`
    );

    return {
      success: true,
      message: `Products synced successfully: ${successCount} products, ${inventoryCount} inventories, ${pricebookCount} pricebook entries`,
      count: {
        total: products.length,
        success: successCount,
        error: errorCount,
        inventories: inventoryCount,
        pricebooks: pricebookCount,
      },
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
    const customers = await fetchAllPages("/customers", {
      includeRemoveIds: true,
      includeCustomerGroup: true,
    });

    if (customers.length === 0) {
      return {
        success: true,
        message: "No customers found to clone",
        count: 0,
      };
    }

    console.log(`👥 Processing ${customers.length} customers...`);

    // Process in batches
    const batchSize = 50;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(
        i,
        Math.min(i + batchSize, customers.length)
      );

      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          customers.length / batchSize
        )}`
      );

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
            location_name: customer.locationName || "",
            ward_name: customer.wardName || "",
            modified_date: customer.modifiedDate
              ? new Date(customer.modifiedDate)
              : null,
            created_date: customer.createdDate
              ? new Date(customer.createdDate)
              : null,
            type: customer.type,
            groups: customer.groups || "",
            debt: customer.debt || 0,
            contact_number: customer.contactNumber || "",
            comments: customer.comments || "",
            address: customer.address || "",
            synced_at: new Date(),
          });

          successCount++;
        } catch (error) {
          console.error(
            `❌ Error processing customer ${customer.code}:`,
            error.message
          );
          errorCount++;
        }
      }

      if (customerRows.length > 0) {
        // Upsert customers to kv_customers table
        const { error } = await supabase
          .from("kv_customers")
          .upsert(customerRows, {
            onConflict: "kiotviet_id",
            ignoreDuplicates: false,
          });

        if (error) {
          console.error("❌ Error upserting customers:", error);
          errorCount += customerRows.length;
          successCount -= customerRows.length;
        }
      }
    }

    console.log(
      `✅ Completed customer clone: ${successCount} customers processed, ${errorCount} errors`
    );

    return {
      success: true,
      message: `Customers cloned successfully: ${successCount} processed, ${errorCount} errors`,
      count: {
        total: customers.length,
        success: successCount,
        error: errorCount,
      },
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
      throw new Error("Invalid year or month");
    }

    console.log(`🔄 Starting invoice clone process for ${yearNum}/${monthNum}`);

    // Format month with leading zero if needed
    const monthStr = monthNum.toString().padStart(2, "0");

    // Create date range for the month
    const startDate = `${yearNum}-${monthStr}-01`;
    // Calculate the last day of the month
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const endDate = `${yearNum}-${monthStr}-${lastDay}`;

    // Fetch invoices from KiotViet API
    const invoices = await fetchAllPages("/invoices", {
      fromPurchaseDate: startDate,
      toPurchaseDate: endDate,
      includeInvoiceDetails: true,
    });

    if (invoices.length === 0) {
      return {
        success: true,
        message: `No invoices found for ${yearNum}/${monthStr}`,
        count: 0,
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

      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          invoices.length / batchSize
        )}`
      );

      // Process invoices in current batch
      for (const invoice of batch) {
        try {
          // Map KiotViet invoice data to our database structure
          const invoiceData = {
            kiotviet_id: invoice.id,
            uuid: invoice.uuid || null,
            code: invoice.code,
            purchase_date: invoice.purchaseDate
              ? new Date(invoice.purchaseDate)
              : null,
            branch_id: invoice.branchId,
            branch_name: invoice.branchName || "",
            sold_by_id: invoice.soldById || null,
            sold_by_name: invoice.soldByName || "",
            kiotviet_customer_id: invoice.customerId || null,
            customer_code: invoice.customerCode || "",
            customer_name: invoice.customerName || "",
            order_code: invoice.orderCode || "",
            total: invoice.total || 0,
            total_payment: invoice.totalPayment || 0,
            status: invoice.status || null,
            status_value: invoice.statusValue || "",
            using_cod: invoice.usingCod || false,
            created_date: invoice.createdDate
              ? new Date(invoice.createdDate)
              : null,
            synced_at: new Date(),
            description: invoice.description || "",
            discount: invoice.discount || 0,
            // source: 'kiotviet'
          };

          // Insert or update invoice
          const { data: savedInvoice, error: invoiceError } = await supabase
            .from("kv_invoices")
            .upsert([invoiceData], {
              onConflict: "kiotviet_id",
              ignoreDuplicates: false,
            })
            .select();

          if (invoiceError) {
            console.error(
              `❌ Error upserting invoice ${invoice.code}:`,
              invoiceError
            );
            errorCount++;
            continue;
          }

          // Process invoice details if available
          if (
            invoice.invoiceDetails &&
            Array.isArray(invoice.invoiceDetails) &&
            savedInvoice &&
            savedInvoice.length > 0
          ) {
            const invoiceId = savedInvoice[0].id;

            // Delete existing details for this invoice
            const { error: deleteError } = await supabase
              .from("kv_invoice_details")
              .delete()
              .eq("invoice_id", invoiceId);

            if (deleteError) {
              console.error(
                `❌ Error deleting invoice details for invoice ${invoice.code}:`,
                deleteError
              );
              continue;
            }

            // Prepare details for batch insert
            const detailsData = invoice.invoiceDetails.map((detail) => ({
              invoice_id: invoiceId,
              kiotviet_product_id: detail.productId,
              product_code: detail.productCode || "",
              product_name: detail.productName || "",
              category_id: detail.categoryId || null,
              category_name: detail.categoryName || "",
              quantity: detail.quantity || 0,
              price: detail.price || 0,
              discount: detail.discount || 0,
              sub_total: detail.subTotal || 0,
              note: detail.note || "",
              serial_numbers: detail.serialNumbers || "",
              return_quantity: detail.returnQuantity || 0,
              synced_at: new Date(),
            }));

            if (detailsData.length > 0) {
              // Insert new details
              const { error: detailsError } = await supabase
                .from("kv_invoice_details")
                .insert(detailsData);

              if (detailsError) {
                console.error(
                  `❌ Error inserting details for invoice ${invoice.code}:`,
                  detailsError
                );
              } else {
                detailsCount += detailsData.length;
              }
            }
          }

          successCount++;
        } catch (error) {
          console.error(
            `❌ Error processing invoice ${invoice.code}:`,
            error.message
          );
          errorCount++;
        }
      }
    }

    console.log(
      `✅ Completed invoice clone: ${successCount} invoices, ${detailsCount} details, ${errorCount} errors`
    );

    return {
      success: true,
      message: `Invoices for ${yearNum}/${monthStr} cloned successfully`,
      count: {
        total: invoices.length,
        success: successCount,
        error: errorCount,
        details: detailsCount,
      },
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
      throw new Error("Invalid year, month, or day");
    }

    // Format date parts with leading zeros if needed
    const monthStr = monthNum.toString().padStart(2, "0");
    const dayStr = dayNum.toString().padStart(2, "0");

    // Create date string for the specific day (YYYY-MM-DD)
    const dateStr = `${yearNum}-${monthStr}-${dayStr}`;

    console.log(`🔄 Starting invoice clone process for ${dateStr}`);

    // Fetch invoices from KiotViet API for the specific day
    const invoices = await fetchAllPages("/invoices", {
      fromPurchaseDate: dateStr,
      toPurchaseDate: dateStr,
      includeInvoiceDetails: true,
    });

    if (invoices.length === 0) {
      return {
        success: true,
        message: `No invoices found for ${dateStr}`,
        count: 0,
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

      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          invoices.length / batchSize
        )}`
      );

      // Process invoices in current batch
      for (const invoice of batch) {
        try {
          // Map KiotViet invoice data to our database structure
          const invoiceData = {
            kiotviet_id: invoice.id,
            uuid: invoice.uuid || null,
            code: invoice.code,
            purchase_date: invoice.purchaseDate
              ? new Date(invoice.purchaseDate)
              : null,
            branch_id: invoice.branchId,
            branch_name: invoice.branchName || "",
            sold_by_id: invoice.soldById || null,
            sold_by_name: invoice.soldByName || "",
            kiotviet_customer_id: invoice.customerId || null,
            customer_code: invoice.customerCode || "",
            customer_name: invoice.customerName || "",
            order_code: invoice.orderCode || "",
            total: invoice.total || 0,
            total_payment: invoice.totalPayment || 0,
            status: invoice.status || null,
            status_value: invoice.statusValue || "",
            using_cod: invoice.usingCod || false,
            created_date: invoice.createdDate
              ? new Date(invoice.createdDate)
              : null,
            synced_at: new Date(),
            description: invoice.description || "",
            discount: invoice.discount || 0,
            // source: 'kiotviet'
          };

          // Insert or update invoice
          const { data: savedInvoice, error: invoiceError } = await supabase
            .from("kv_invoices")
            .upsert([invoiceData], {
              onConflict: "kiotviet_id",
              ignoreDuplicates: false,
            })
            .select();

          if (invoiceError) {
            console.error(
              `❌ Error upserting invoice ${invoice.code}:`,
              invoiceError
            );
            errorCount++;
            continue;
          }

          // Process invoice details if available
          if (
            invoice.invoiceDetails &&
            Array.isArray(invoice.invoiceDetails) &&
            savedInvoice &&
            savedInvoice.length > 0
          ) {
            const invoiceId = savedInvoice[0].id;

            // Delete existing details for this invoice
            const { error: deleteError } = await supabase
              .from("kv_invoice_details")
              .delete()
              .eq("invoice_id", invoiceId);

            if (deleteError) {
              console.error(
                `❌ Error deleting invoice details for invoice ${invoice.code}:`,
                deleteError
              );
              continue;
            }

            // Prepare details for batch insert
            const detailsData = invoice.invoiceDetails.map((detail) => ({
              invoice_id: invoiceId,
              kiotviet_product_id: detail.productId,
              product_code: detail.productCode || "",
              product_name: detail.productName || "",
              category_id: detail.categoryId || null,
              category_name: detail.categoryName || "",
              quantity: detail.quantity || 0,
              price: detail.price || 0,
              discount: detail.discount || 0,
              sub_total: detail.subTotal || 0,
              note: detail.note || "",
              serial_numbers: detail.serialNumbers || "",
              return_quantity: detail.returnQuantity || 0,
              synced_at: new Date(),
            }));

            if (detailsData.length > 0) {
              // Insert new details
              const { error: detailsError } = await supabase
                .from("kv_invoice_details")
                .insert(detailsData);

              if (detailsError) {
                console.error(
                  `❌ Error inserting details for invoice ${invoice.code}:`,
                  detailsError
                );
              } else {
                detailsCount += detailsData.length;
              }
            }
          }

          successCount++;
        } catch (error) {
          console.error(
            `❌ Error processing invoice ${invoice.code}:`,
            error.message
          );
          errorCount++;
        }
      }
    }

    console.log(
      `✅ Completed invoice clone for ${dateStr}: ${successCount} invoices, ${detailsCount} details, ${errorCount} errors`
    );

    return {
      success: true,
      message: `Invoices for ${dateStr} cloned successfully`,
      count: {
        total: invoices.length,
        success: successCount,
        error: errorCount,
        details: detailsCount,
      },
    };
  } catch (error) {
    console.error("❌ Error in invoice clone by day:", error);
    throw error;
  }
}

/**
 * Fetch and clone a single invoice by its KiotViet code
 * @param {string} invoiceCode - The KiotViet invoice code (e.g., 'HD057370')
 * @returns {Promise<Object>} Result of the operation
 */
async function cloneInvoiceByCode(invoiceCode) {
  try {
    if (!invoiceCode) throw new Error("Invoice code is required");
    console.log(
      `🔄 Cloning single invoice from KiotViet for code ${invoiceCode}`
    );

    // Fetch invoice by code
    const headers = await getKiotVietHeaders();
    const url = `${KV_API_URL}/invoices/code/${invoiceCode}`;
    console.log("➡️ Fetching invoice by code from KiotViet:", url);
    const resp = await axios.get(url, { headers });
    const invoice = resp.data;
    if (!invoice || !invoice.id) {
      return {
        success: false,
        message: `No invoice found for code ${invoiceCode}`,
      };
    }

    // Map invoice data
    const invoiceRow = {
      kiotviet_id: invoice.id,
      uuid: invoice.uuid || null,
      code: invoice.code,
      purchase_date: invoice.purchaseDate
        ? new Date(invoice.purchaseDate)
        : null,
      branch_id: invoice.branchId,
      branch_name: invoice.branchName || "",
      sold_by_id: invoice.soldById || null,
      sold_by_name: invoice.soldByName || "",
      kiotviet_customer_id: invoice.customerId || null,
      customer_code: invoice.customerCode || "",
      customer_name: invoice.customerName || "",
      order_code: invoice.orderCode || "",
      total: invoice.total || 0,
      total_payment: invoice.totalPayment || 0,
      status: invoice.status || null,
      status_value: invoice.statusValue || "",
      using_cod: invoice.usingCod || false,
      created_date: invoice.createdDate ? new Date(invoice.createdDate) : null,
      synced_at: new Date(),
      sale_channel_name: invoice.SaleChannel.Name || "gltpos",
      description: invoice.description || "",
      discount: invoice.discount || 0,
      // sale_channel_id:   invoice.SaleChannel.Id || 185336,
      // source:           'kiotviet'
    };

    // Upsert invoice
    const { data: saved, error: invErr } = await supabase
      .from("kv_invoices")
      .upsert([invoiceRow], {
        onConflict: "kiotviet_id",
        ignoreDuplicates: false,
      })
      .select();
    if (invErr) throw invErr;
    const invoiceId = saved[0].id;

    // Delete old details
    await supabase
      .from("kv_invoice_details")
      .delete()
      .eq("invoice_id", invoiceId);

    // Insert new details
    if (invoice.invoiceDetails && Array.isArray(invoice.invoiceDetails)) {
      const detailsRows = invoice.invoiceDetails.map((d) => ({
        invoice_id: invoiceId,
        kiotviet_product_id: d.productId,
        product_code: d.productCode || "",
        product_name: d.productName || "",
        category_id: d.categoryId || null,
        category_name: d.categoryName || "",
        quantity: d.quantity || 0,
        price: d.price || 0,
        discount: d.discount || 0,
        sub_total: d.subTotal || 0,
        note: d.note || "",
        serial_numbers: d.serialNumbers || "",
        return_quantity: d.returnQuantity || 0,
        synced_at: new Date(),
      }));
      const { error: detErr } = await supabase
        .from("kv_invoice_details")
        .insert(detailsRows);
      if (detErr) console.error("❌ Error inserting invoice details:", detErr);
    }

    console.log(
      `✅ Cloned invoice ${invoiceCode} successfully (ID: ${invoiceId})`
    );
    return {
      success: true,
      message: `Invoice ${invoiceCode} cloned`,
      id: invoiceId,
    };
  } catch (error) {
    console.error("❌ Error in cloneInvoiceByCode:", error);
    throw error;
  }
}

/**
 * Clone purchase orders from KiotViet API for a specific date range
 * @param {string} fromDate - Start date in MM/DD/YYYY format
 * @param {string} toDate - End date in MM/DD/YYYY format
 * @returns {Promise<Object>} Results of the operation
 */
async function clonePurchaseOrders(fromDate, toDate) {
  try {
    console.log(
      `🔄 Starting purchase order sync from ${fromDate} to ${toDate}`
    );

    // Fetch purchase orders from KiotViet API
    const purchaseOrders = await fetchAllPages("/purchaseorders", {
      fromPurchaseDate: fromDate,
      toPurchaseDate: toDate,
      status: 3, // Completed orders
      pageSize: 100,
    });

    if (purchaseOrders.length === 0) {
      return {
        success: true,
        message: "No purchase orders found to sync",
        count: 0,
      };
    }

    console.log(`📦 Processing ${purchaseOrders.length} purchase orders...`);

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each purchase order
    for (const po of purchaseOrders) {
      try {
        // Check if PO already exists
        const { data: existingPO } = await supabase
          .from("kv_purchase_orders")
          .select("id")
          .eq("kiotviet_id", po.id)
          .single();

        if (existingPO) {
          console.log(
            `⏭️ Skipping purchase order ${po.code} (ID: ${po.id}) - already exists`
          );
          skippedCount++;
          continue;
        }

        // Insert the purchase order
        const { data: newPO, error: poError } = await supabase
          .from("kv_purchase_orders")
          .insert([
            {
              kiotviet_id: po.id,
              retailer_id: po.retailerId,
              code: po.code,
              description: po.description || "",
              branch_id: po.branchId,
              branch_name: po.branchName,
              supplier_id: po.supplierId,
              supplier_name: po.supplierName,
              supplier_code: po.supplierCode || "",
              purchase_by_id: po.purchaseById,
              purchase_name: po.purchaseName,
              purchase_date: po.purchaseDate,
              discount: po.discount,
              discount_ratio: po.discountRatio,
              total: po.total,
              total_payment: po.totalPayment,
              ex_return_suppliers: po.exReturnSuppliers,
              ex_return_third_party: po.exReturnThirdParty,
              status: po.status,
              created_date: po.createdDate,
            },
          ])
          .select("id")
          .single();

        if (poError) {
          console.error(
            `❌ Error inserting purchase order ${po.code}:`,
            poError
          );
          errorCount++;
          continue;
        }

        // Process purchase order details
        if (po.purchaseOrderDetails && po.purchaseOrderDetails.length > 0) {
          const detailsToInsert = po.purchaseOrderDetails.map((detail) => ({
            purchase_order_id: newPO.id,
            product_id: detail.productId,
            product_code: detail.productCode,
            product_name: detail.productName,
            quantity: detail.quantity,
            price: detail.price,
            discount: detail.discount,
            batch_expire_id: detail.productBatchExpire?.id || null,
            batch_name: detail.productBatchExpire?.batchName || null,
            batch_expire_date: detail.productBatchExpire?.expireDate || null,
          }));

          const { error: detailsError } = await supabase
            .from("kv_purchase_order_details")
            .insert(detailsToInsert);

          if (detailsError) {
            console.error(
              `❌ Error inserting details for purchase order ${po.code}:`,
              detailsError
            );
            // Continue despite detail errors - the main PO record is already created
          }
        }

        console.log(
          `✅ Successfully synced purchase order ${po.code} (ID: ${po.id})`
        );
        createdCount++;
      } catch (poError) {
        console.error(
          `❌ Error processing purchase order ${po.code || po.id}:`,
          poError
        );
        errorCount++;
      }
    }

    return {
      success: true,
      message: `Purchase orders sync completed: ${createdCount} created, ${skippedCount} skipped, ${errorCount} failed`,
      stats: {
        total: purchaseOrders.length,
        created: createdCount,
        skipped: skippedCount,
        errors: errorCount,
      },
    };
  } catch (error) {
    console.error("❌ Error in purchase orders sync:", error);
    return {
      success: false,
      message: `Purchase orders sync failed: ${error.message}`,
      error,
    };
  }
}

/**
 * Clone purchase orders for a 3-month period until today
 * @returns {Promise<Object>} Results of the operation
 */
async function cloneRecentPurchaseOrders() {
  try {
    // Calculate date range (3 months ago to today)
    const today = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(today.getMonth() - 3);

    const fromDate = `${(threeMonthsAgo.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${threeMonthsAgo
      .getDate()
      .toString()
      .padStart(2, "0")}/${threeMonthsAgo.getFullYear()}`;
    const toDate = `${(today.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${today
      .getDate()
      .toString()
      .padStart(2, "0")}/${today.getFullYear()}`;

    return await clonePurchaseOrders(fromDate, toDate);
  } catch (error) {
    console.error("❌ Error in recent purchase orders sync:", error);
    return {
      success: false,
      message: `Recent purchase orders sync failed: ${error.message}`,
      error,
    };
  }
}

/**
 * Get product details from KiotViet API
 * @param {number} productId - KiotViet product ID
 * @returns {Promise<Object>} Product details
 */
async function getProductDetails(productId) {
  try {
    const token = await getKiotVietToken();
    const response = await axios.get(`${KV_API_URL}/products/${productId}`, {
      headers: {
        Retailer: KV_RETAILER,
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching product details:", error);
    throw new Error(`Failed to fetch product details: ${error.message}`);
  }
}

/**
 * Update product changelog
 * @param {number} productId - KiotViet product ID
 * @param {Object} oldData - Old product data
 * @param {Object} newData - New product data
 */
async function updateProductChangelog(productId, oldData, newData) {
  try {
    const changes = [];

    // Check for base price change
    if (oldData.basePrice !== newData.basePrice) {
      changes.push({
        kiotviet_id: productId,
        field: "base_price",
        old_value: oldData.basePrice?.toString(),
        new_value: newData.basePrice?.toString(),
        created_at: new Date(),
      });
    }

    // Check for cost change
    const oldCost = oldData.inventories?.[0]?.cost;
    const newCost = newData.inventories?.[0]?.cost;
    if (oldCost !== newCost) {
      changes.push({
        kiotviet_id: productId,
        field: "cost",
        old_value: oldCost?.toString(),
        new_value: newCost?.toString(),
        created_at: new Date(),
      });
    }

    // Check for description change
    if (oldData.description !== newData.description) {
      changes.push({
        kiotviet_id: productId,
        field: "description",
        old_value: oldData.description || "",
        new_value: newData.description || "",
        created_at: new Date(),
      });
    }

    // Insert changes if any
    if (changes.length > 0) {
      const { error } = await supabase
        .from("glt_product_changelogs")
        .insert(changes);

      if (error) {
        console.error("Error inserting product changelog:", error);
        throw error;
      }
      console.log(
        `✅ Added ${changes.length} changelog entries for product ${productId}`
      );
    }
  } catch (error) {
    console.error("Error updating product changelog:", error);
    throw new Error(`Failed to update product changelog: ${error.message}`);
  }
}

/**
 * Update purchase order status
 * @param {number} productId - KiotViet product ID
 * @param {string} status - New status
 */
async function updatePurchaseOrderStatus(productId, status) {
  try {
    await supabase
      .from("kv_purchase_orders")
      .update({ glt_status: status })
      .eq("product_id", productId);
  } catch (error) {
    console.error("Error updating purchase order status:", error);
    throw new Error(`Failed to update purchase order status: ${error.message}`);
  }
}

/**
 * Update product in KiotViet
 * @param {number} productId - KiotViet product ID
 * @param {Object} updateData - Data to update
 */
async function updateKiotVietProduct(productId, updateData) {
  try {
    const token = await getKiotVietToken();
    await axios.put(`${KV_API_URL}/products/${productId}`, updateData, {
      headers: {
        Retailer: KV_RETAILER,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error("Error updating KiotViet product:", error);
    throw new Error(`Failed to update KiotViet product: ${error.message}`);
  }
}

/**
 * Main function to update product
 * @param {number} productId - KiotViet product ID
 * @param {string} status - New status
 * @param {number} cost - New cost
 * @param {number} basecost - New base cost
 * @param {string} note - New note/description
 */
async function updateProduct(productId, status, cost, basecost, note) {
  try {
    // Get current product details
    const currentProduct = await getProductDetails(productId);

    // Prepare update data
    const updateData = {
      basePrice: basecost,
      description: note || currentProduct.description,
      inventories: [
        {
          branchId: 15132,
          cost: cost,
        },
      ],
    };

    // Update product in KiotViet
    await updateKiotVietProduct(productId, updateData);

    // Update changelog
    await updateProductChangelog(productId, currentProduct, {
      ...currentProduct,
      ...updateData,
    });

    // Update purchase order status
    await updatePurchaseOrderStatus(productId, status);
  } catch (error) {
    console.error("Error in updateProduct:", error);
    throw error;
  }
}

/**
 * Update purchase order detail status and optionally update product
 * @param {number} purchaseOrderDetailId - Purchase order detail ID
 * @param {string} status - Status to set ('done' or 'skipped')
 * @param {Object} [updateData] - Data for updating product if status is 'done'
 */
async function updateProductWithStatus(
  purchaseOrderDetailId,
  status,
  updateData
) {
  try {
    // 1. Update purchase order detail status
    const { error: updateError } = await supabase
      .from("kv_purchase_order_details")
      .update({ glt_status: status })
      .eq("id", purchaseOrderDetailId);

    if (updateError) {
      console.error(
        "Error updating purchase order detail status:",
        updateError
      );
      throw new Error(
        `Failed to update purchase order detail status: ${updateError.message}`
      );
    }

    // 2. Nếu là "done", cập nhật product và inventory
    if (status === "done" && updateData) {
      const {
        kiotviet_product_id,
        cost,
        baseprice,
        description, // <- truyền từ FE
      } = updateData;

      // Lấy thông tin hiện tại của sản phẩm (từ KiotViet hoặc DB)
      const currentProduct = await getProductDetails(kiotviet_product_id);

      // Chuẩn bị data update cho KiotViet (hoặc Supabase)
      const kvUpdateData = {
        basePrice: baseprice,
        description:
          description != null ? description : currentProduct.description,
        inventories: [
          {
            branchId: 15132,
            cost: cost,
          },
        ],
      };

      // Cập nhật sản phẩm trên KiotViet
      await updateKiotVietProduct(kiotviet_product_id, kvUpdateData);

      // Cập nhật changelog nếu cần
      await updateProductChangelog(kiotviet_product_id, currentProduct, {
        ...currentProduct,
        basePrice: baseprice,
        description: kvUpdateData.description,
        inventories: kvUpdateData.inventories,
      });
    }
  } catch (error) {
    console.error("Error in updateProductWithStatus:", error);
    throw error;
  }
}

/**
 * Fetch and save pricebooks from KiotViet API
 * @returns {Promise<Object>} Results of the operation
 */
async function clonePricebooks() {
  try {
    console.log("🔄 Starting pricebook sync process");

    // Fetch pricebooks from KiotViet API
    const pricebooks = await fetchAllPages("/pricebooks", {
      includePriceBookCustomerGroups: true,
    });

    if (pricebooks.length === 0) {
      return {
        success: true,
        message: "No pricebooks found to sync",
        count: 0,
      };
    }

    console.log(`📚 Processing ${pricebooks.length} pricebooks...`);

    let successCount = 0;
    let errorCount = 0;
    let productPricebookCount = 0;

    // Process pricebooks
    for (const pricebook of pricebooks) {
      try {
        // For each customer group in the pricebook
        if (
          pricebook.priceBookCustomerGroups &&
          Array.isArray(pricebook.priceBookCustomerGroups)
        ) {
          for (const group of pricebook.priceBookCustomerGroups) {
            // Map pricebook data for each customer group
            const pricebookData = {
              id: pricebook.id,
              name: pricebook.name,
              is_active: pricebook.isActive,
              is_global: true, // Default to true as per schema
              start_date: pricebook.startDate
                ? new Date(pricebook.startDate)
                : null,
              end_date: pricebook.endDate ? new Date(pricebook.endDate) : null,
              customer_group_name: group.customerGroupName || "default",
              created_at: new Date(),
              updated_at: new Date(),
            };

            // Upsert pricebook
            const { error: pricebookError } = await supabase
              .from("kv_pricebooks")
              .upsert([pricebookData], {
                onConflict: "id",
                ignoreDuplicates: false,
              });

            if (pricebookError) {
              console.error(
                `❌ Error upserting pricebook ${pricebook.name} for group ${group.customerGroupName}:`,
                pricebookError
              );
              errorCount++;
              continue;
            }

            // Process product prices if available
            if (
              pricebook.priceBookProducts &&
              Array.isArray(pricebook.priceBookProducts)
            ) {
              const productPrices = [];

              for (const product of pricebook.priceBookProducts) {
                // Get the internal product ID from kv_products
                const { data: productData, error: productError } =
                  await supabase
                    .from("kv_products")
                    .select("id")
                    .eq("kiotviet_id", product.productId)
                    .single();

                if (productError) {
                  console.error(
                    `❌ Error finding product ${product.productId}:`,
                    productError
                  );
                  continue;
                }

                productPrices.push({
                  pricebook_id: pricebook.id,
                  pricebook_name: pricebook.name,
                  customer_group_name: group.customerGroupName || "default",
                  product_id: productData.id,
                  product_kiotviet_id: product.productId,
                  price: product.price,
                  is_active: true,
                  start_date: pricebook.startDate
                    ? new Date(pricebook.startDate)
                    : null,
                  end_date: pricebook.endDate
                    ? new Date(pricebook.endDate)
                    : null,
                });
              }

              if (productPrices.length > 0) {
                // Delete existing product prices for this pricebook and customer group
                const { error: deleteError } = await supabase
                  .from("kv_product_pricebooks")
                  .delete()
                  .eq("pricebook_id", pricebook.id)
                  .eq(
                    "customer_group_name",
                    group.customerGroupName || "default"
                  );

                if (deleteError) {
                  console.error(
                    `❌ Error deleting existing product prices for pricebook ${pricebook.name}:`,
                    deleteError
                  );
                  continue;
                }

                // Insert new product prices
                const { error: insertError, count } = await supabase
                  .from("kv_product_pricebooks")
                  .insert(productPrices);

                if (insertError) {
                  console.error(
                    `❌ Error inserting product prices for pricebook ${pricebook.name}:`,
                    insertError
                  );
                } else {
                  productPricebookCount += count;
                }
              }
            }

            successCount++;
          }
        } else {
          // Handle pricebooks without customer groups (use default group)
          const pricebookData = {
            id: pricebook.id,
            name: pricebook.name,
            is_active: pricebook.isActive,
            is_global: true,
            start_date: pricebook.startDate
              ? new Date(pricebook.startDate)
              : null,
            end_date: pricebook.endDate ? new Date(pricebook.endDate) : null,
            customer_group_name: "default",
            created_at: new Date(),
            updated_at: new Date(),
          };

          // Upsert pricebook
          const { error: pricebookError } = await supabase
            .from("kv_pricebooks")
            .upsert([pricebookData], {
              onConflict: "id",
              ignoreDuplicates: false,
            });

          if (pricebookError) {
            console.error(
              `❌ Error upserting pricebook ${pricebook.name}:`,
              pricebookError
            );
            errorCount++;
            continue;
          }

          successCount++;
        }
      } catch (error) {
        console.error(
          `❌ Error processing pricebook ${pricebook.name}:`,
          error.message
        );
        errorCount++;
      }
    }

    console.log(
      `✅ Completed pricebook sync: ${successCount} pricebooks, ${productPricebookCount} product prices`
    );

    return {
      success: true,
      message: `Pricebooks synced successfully: ${successCount} pricebooks, ${productPricebookCount} product prices`,
      count: {
        total: pricebooks.length,
        success: successCount,
        error: errorCount,
        productPrices: productPricebookCount,
      },
    };
  } catch (error) {
    console.error("❌ Error in pricebook sync:", error);
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
  cloneInvoicesByDay,
  cloneInvoiceByCode,
  clonePurchaseOrders,
  cloneRecentPurchaseOrders,
  refreshKiotVietToken,
  getProductDetails,
  updateProductChangelog,
  updatePurchaseOrderStatus,
  updateKiotVietProduct,
  updateProduct,
  updateProductWithStatus,
  clonePricebooks,
};
