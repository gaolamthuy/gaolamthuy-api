require("dotenv").config();
const axios = require("axios");
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

async function fetchKiotVietProducts(token) {
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

async function importData(products) {
  console.log("🚀 Starting import...");

  // Clean tables
  await supabase.from("kiotviet_inventories").delete().neq("id", 0);
  await supabase.from("kiotviet_products").delete().neq("id", 0);
  console.log("✅ Tables cleared");

  // Prepare arrays
  const productRecords = [];
  const inventoryRecords = [];

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

    if (product.inventories?.length) {
      for (const inventory of product.inventories) {
        inventoryRecords.push({
          product_id: product.id,
          product_code: inventory.productCode,
          product_name: inventory.productName,
          branch_id: inventory.branchId,
          branch_name: inventory.branchName,
          cost: inventory.cost,
          on_hand: inventory.onHand,
          reserved: inventory.reserved,
          actual_reserved: inventory.actualReserved,
          min_quantity: inventory.minQuantity,
          max_quantity: inventory.maxQuantity,
          is_active: inventory.isActive,
          on_order: inventory.onOrder,
        });
      }
    }
  }

  // Insert products
  const { error: productError } = await supabase
    .from("kiotviet_products")
    .insert(productRecords);
  if (productError) throw productError;

  console.log(`✅ Inserted ${productRecords.length} products`);

  // Insert inventories
  const { error: inventoryError } = await supabase
    .from("kiotviet_inventories")
    .insert(inventoryRecords);
  if (inventoryError) throw inventoryError;

  console.log(`✅ Inserted ${inventoryRecords.length} inventory records`);
}

// API endpoint
app.post("/clone-kiotviet", async (req, res) => {
  const token = req.headers["x-api-key"];
  if (token !== process.env.YOUR_SECRET_TOKEN) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  try {
    const kiotvietToken = await getKiotVietToken();
    const products = await fetchKiotVietProducts(kiotvietToken);
    await importData(products);

    res
      .status(200)
      .json({ success: true, message: "KiotViet clone completed" });
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simple health check
app.get("/", (req, res) => {
  res.send("✅ KiotViet Clone Service is running!");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
