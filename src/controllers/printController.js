const path = require("path");
const fs = require("fs").promises;
const { createClient } = require("@supabase/supabase-js");
const Handlebars = require("handlebars");
const { formatCurrency } = require("../utils/formatUtils");

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Register Handlebars helper for price formatting
Handlebars.registerHelper("formatPrice", function (price) {
  return formatCurrency(price);
});

// Register Handlebars helper for index + 1
Handlebars.registerHelper("inc", function (value) {
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
      return res.status(400).send("Customer ID is required");
    }

    console.log(
      `🔍 Fetching customer info for KiotViet ID: ${kiotviet_customer_id}`
    );

    // Get customer information
    const { data: customer, error: customerError } = await supabase
      .from("kv_customers")
      .select("name, code, groups")
      .eq("kiotviet_id", kiotviet_customer_id)
      .single();

    if (customerError) {
      console.error("Error fetching customer:", customerError);
      return res.status(500).send("Error fetching customer data");
    }

    if (!customer) {
      console.error("Customer not found:", kiotviet_customer_id);
      return res.status(404).send("Customer not found");
    }

    console.log("✅ Found customer:", customer);

    // Check if customer has a group assigned
    if (!customer.groups) {
      return res
        .status(404)
        .send(
          `No specific pricebook for this customer: ${customer.name} (${customer.code})`
        );
    }

    // Get active categories
    const { data: categories, error: categoriesError } = await supabase
      .from("kv_product_categories")
      .select("category_id, category_name, rank")
      .eq("glt_is_active", true)
      .order("rank");

    if (categoriesError) {
      console.error("Error fetching categories:", categoriesError);
      return res.status(500).send("Error fetching categories");
    }

    // Get all active products with their categories
    const { data: products, error: productsError } = await supabase
      .from("kv_products")
      .select(
        `
        id,
        full_name,
        base_price,
        is_active,
        category_id,
        category_name
      `
      )
      .eq("is_active", true)
      .eq("unit", "kg")
      .order("category_name, full_name");

    if (productsError) {
      console.error("Error fetching products:", productsError);
      return res.status(500).send("Error fetching product data");
    }

    console.log(`✅ Found ${products.length} active products`);

    // Get pricebook prices for these products with the customer's group
    const { data: pricebookPrices, error: pricesError } = await supabase
      .from("kv_product_pricebooks")
      .select(
        `
        product_id,
        price,
        is_active,
        start_date,
        end_date,
        customer_group_name
      `
      )
      .eq("is_active", true)
      .eq("customer_group_name", customer.groups)
      .lte("start_date", new Date().toISOString())
      .gte("end_date", new Date().toISOString());

    if (pricesError) {
      console.error("Error fetching pricebook prices:", pricesError);
      return res.status(500).send("Error fetching price data");
    }

    console.log(
      `✅ Found ${
        pricebookPrices?.length || 0
      } active pricebook prices for customer group ${customer.groups}`
    );

    // If no prices found for the customer's group, return appropriate message
    if (!pricebookPrices || pricebookPrices.length === 0) {
      return res
        .status(404)
        .send(
          `No active pricebook found for customer group: ${customer.groups}`
        );
    }

    // Create a map of special prices by product ID
    const priceMap = {};
    pricebookPrices?.forEach((price) => {
      if (
        !priceMap[price.product_id] ||
        price.price < priceMap[price.product_id]
      ) {
        priceMap[price.product_id] = price.price;
      }
    });

    // Create a map of categories with their products
    const categoryMap = new Map();
    categories.forEach((cat) => {
      categoryMap.set(cat.category_id, {
        name: cat.category_name,
        rank: cat.rank,
        products: [],
      });
    });

    // Group products by category and calculate their final prices
    products.forEach((product) => {
      if (categoryMap.has(product.category_id)) {
        categoryMap.get(product.category_id).products.push({
          fullName: product.full_name,
          price: priceMap[product.id] || product.base_price,
        });
      }
    });

    // Sort products by price within each category
    categoryMap.forEach((category) => {
      category.products.sort((a, b) => a.price - b.price);
    });

    // Convert map to array and filter out categories with no products
    const productCategories = Array.from(categoryMap.values())
      .filter((category) => category.products.length > 0)
      .sort((a, b) => a.rank - b.rank); // Sort by category rank

    // Get current date in Vietnamese format
    const now = new Date();
    const currentDate = now.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Read template file
    const templatePath = path.join(
      __dirname,
      "../views/templates/price-table.html"
    );
    const templateContent = await fs.readFile(templatePath, "utf-8");

    // Compile template
    const template = Handlebars.compile(templateContent);

    // Render template with data
    const html = template({
      customerName: customer.name,
      customerCode: customer.code,
      currentDate,
      categories: productCategories,
    });

    // Send response
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error("Error generating price table:", error);
    res.status(500).send("Error generating price table");
  }
};

// Note: getPrintPriceBoard is handled directly in kiotvietController

/**
 * Get retail price table (no customer specific pricing)
 * Can show content with clean HTML or with rice-specific card layout
 */
exports.getPrintRetailPriceTable = async (req, res) => {
  try {
    console.log("🛍️ Generating retail price table...");

    // Get background parameter (true/false), default is false
    const { background = "false" } = req.query;
    const useBackground = background === "true";

    console.log(`📄 Generating price table with background: ${useBackground}`);

    // For background mode, we only include 'Gạo dẻo' category and use specialized template
    if (useBackground) {
      return generatePriceTableWithBackground(req, res);
    }

    // For standard mode, use view_product
    console.log(
      "🛍️ Generating standard retail price table using view_product..."
    );

    const { data: productsData, error: productsError } = await supabase
      .from("view_product")
      .select(
        "full_name, category_id, category_name, category_rank, base_price, whole_p10_price, cost, glt_retail_promotion"
      )
      .eq("glt_visible", true) // Assuming only visible products should be on the price table
      .order("category_rank, cost");

    if (productsError) {
      console.error(
        "Error fetching products from view_product for retail price table:",
        productsError
      );
      return res.status(500).send("Error fetching product data");
    }
    console.log(
      `✅ Found ${productsData.length} products from view_product for retail price table.`
    );

    // Group products by category
    const categoryMap = new Map();
    productsData.forEach((product) => {
      if (!categoryMap.has(product.category_id)) {
        categoryMap.set(product.category_id, {
          name: product.category_name,
          rank: product.category_rank,
          products: [],
        });
      }
      categoryMap.get(product.category_id).products.push({
        fullName: product.full_name,
        basePrice: product.base_price, // "Giá bán lẻ"
        retailPrice: product.whole_p10_price, // "Giá sỉ" (cost + 2000 from view)
        cost: product.cost, // For sorting or other logic if needed
        glt_retail_promotion: product.glt_retail_promotion, // For KM flag
      });
    });

    // Sort products by cost within each category (if cost is available and meaningful here)
    // If sorting by basePrice or retailPrice is preferred, adjust accordingly.
    categoryMap.forEach((category) => {
      category.products.sort((a, b) => (a.cost || 0) - (b.cost || 0));
    });

    const productCategories = Array.from(categoryMap.values())
      .filter((category) => category.products.length > 0)
      .sort((a, b) => a.rank - b.rank); // Sort by category rank

    // Get current date in Vietnamese format
    const now = new Date();
    const currentDate = now.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Read template file - using the new retail-specific template
    const templatePath = path.join(
      __dirname,
      "../views/templates/price-table-retail.html"
    );
    const templateContent = await fs.readFile(templatePath, "utf-8");

    // Compile template
    const template = Handlebars.compile(templateContent);

    // Render template with data
    const html = template({
      pageTitle: "BẢNG GIÁ BÁN LẺ & SỈ", // Updated title
      currentDate,
      categories: productCategories,
    });

    // Send response
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error("Error generating retail price table:", error);
    res.status(500).send("Error generating retail price table");
  }
};

/**
 * Generate a price table HTML specifically for a category with card-style layout
 */
const generatePriceTableWithBackground = async (req, res) => {
  try {
    // Get category_id from query parameters, default to 'Gạo dẻo' category
    const { category } = req.query;

    console.log(
      `🖼️ Generating styled price table HTML for category: ${
        category || "Gạo dẻo"
      }`
    );

    // Build query to filter products
    let query = supabase
      .from("view_product")
      .select("*")
      .order("cost")
      .limit(12);

    // Filter by category_id if provided, otherwise use 'Gạo dẻo' as the default category name
    if (category) {
      query = query.eq("category_id", category);
    } else {
      query = query.eq("category_name", "Gạo dẻo");
    }

    // Execute the query
    const { data: products, error: productsError } = await query;

    if (productsError) {
      console.error("Error fetching products:", productsError);
      return res
        .status(500)
        .send("Error fetching products: " + productsError.message);
    }

    console.log(`✅ Found ${products.length} products`);

    if (products.length === 0) {
      return res
        .status(404)
        .send("No products found for the specified category");
    }

    // Get current date in Vietnamese format
    const now = new Date();
    const currentDate = now.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Get category name for the header
    let categoryName = "GẠO NỞ"; // Default
    if (products.length > 0) {
      categoryName = products[0].category_name.toUpperCase();
    }

    // Read the template file
    const templatePath = path.join(
      __dirname,
      "../views/templates/price-table-background.html"
    );
    const templateContent = await fs.readFile(templatePath, "utf-8");

    // Compile template
    const template = Handlebars.compile(templateContent);

    // Format descriptions if needed
    const formattedProducts = products.map((product) => {
      return {
        ...product,
        description:
          product.description || "Cơm nở nhiều, rẻo, thích hợp cơm chiên",
      };
    });

    // Render template with data
    const html = template({
      currentDate,
      products: formattedProducts,
      categoryName,
    });

    // Send HTML response
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error("Error generating price table:", error);
    res.status(500).send("Error generating price table: " + error.message);
  }
};

/**
 * Get changelog for a specific date
 */
exports.getChangelog = async (req, res) => {
  try {
    const { output_type = "html", date } = req.query;

    // Validate date format (dd/mm/yyyy)
    if (!date || !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      return res.status(400).send("Invalid date format. Use dd/mm/yyyy");
    }

    // Parse date components
    const [day, month, year] = date.split("/");
    const startDate = new Date(year, month - 1, day);
    const endDate = new Date(year, month - 1, parseInt(day) + 1);

    // Get changelog entries for the specified date
    const { data: changes, error: changesError } = await supabase
      .from("glt_product_changelogs")
      .select(
        `
        id,
        kiotviet_id,
        field,
        old_value,
        new_value,
        created_at,
        kv_products (
          full_name,
          category_id,
          category_name
        )
      `
      )
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString())
      .order("created_at");

    if (changesError) {
      console.error("Error fetching changelog:", changesError);
      return res.status(500).send("Error fetching changelog data");
    }

    // Group changes by product and category
    const productChanges = new Map(); // Map<kiotviet_id, {categoryId, categoryName, fullName, changes}>

    changes.forEach((change) => {
      if (!change.kv_products) return; // Skip if product not found

      const productKey = change.kiotviet_id;
      if (!productChanges.has(productKey)) {
        productChanges.set(productKey, {
          categoryId: change.kv_products.category_id,
          categoryName: change.kv_products.category_name,
          fullName: change.kv_products.full_name,
          cost: {},
          description: {},
        });
      }

      const product = productChanges.get(productKey);

      // Store changes by field
      if (change.field === "cost") {
        product.cost = {
          oldValue: parseFloat(change.old_value) || 0,
          newValue: parseFloat(change.new_value) || 0,
        };
      } else if (change.field === "description") {
        product.description = {
          oldValue: change.old_value || "",
          newValue: change.new_value || "",
        };
      }
    });

    // Group by category and format changes
    const categoryChanges = new Map();

    for (const product of productChanges.values()) {
      if (!categoryChanges.has(product.categoryId)) {
        categoryChanges.set(product.categoryId, {
          name: product.categoryName,
          changes: [],
        });
      }

      const changeItem = {
        fullName: product.fullName,
      };

      // Add cost change if exists
      if (product.cost.newValue !== undefined) {
        const diff = product.cost.newValue - product.cost.oldValue;
        changeItem.costChange = true;
        changeItem.costIncrease = diff > 0;
        changeItem.costDiff = Math.abs(diff);
      }

      // Add description change if exists
      if (
        product.description.newValue !== undefined &&
        product.description.newValue !== product.description.oldValue
      ) {
        changeItem.descriptionChange = true;
        changeItem.oldDescription = product.description.oldValue;
        changeItem.newDescription = product.description.newValue;
      }

      // Only add if there are actual changes
      if (changeItem.costChange || changeItem.descriptionChange) {
        categoryChanges.get(product.categoryId).changes.push(changeItem);
      }
    }

    // Convert to array and sort by category name
    const sortedCategories = Array.from(categoryChanges.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    if (output_type === "plain") {
      // Generate plain text output
      let output = `THAY ĐỔI SẢN PHẨM\nNgày: ${date}\n\n`;

      sortedCategories.forEach((category) => {
        output += `${category.name}\n`;
        category.changes.forEach((change) => {
          let line = change.fullName;

          if (change.costChange) {
            const direction = change.costIncrease ? "tăng" : "giảm";
            line += ` | ${direction} ${formatCurrency(change.costDiff)} đ`;
          }

          if (change.descriptionChange) {
            if (change.costChange) line += " | ";
            line += `${change.oldDescription} → ${change.newDescription}`;
          }

          output += `• ${line}\n`;
        });
        output += "\n";
      });

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.send(output);
    }

    // Read and compile HTML template
    const templatePath = path.join(
      __dirname,
      "../views/templates/changelog.html"
    );
    const templateContent = await fs.readFile(templatePath, "utf-8");
    const template = Handlebars.compile(templateContent);

    // Render HTML
    const html = template({
      date,
      categories: sortedCategories,
    });

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error("Error generating changelog:", error);
    res.status(500).send("Error generating changelog");
  }
};

/**
 * Get wholesale price table (cost + 800)
 * Uses a specific layout for wholesale prices.
 */
exports.getPrintWholePriceTable = async (req, res) => {
  try {
    console.log("📦 Generating wholesale price table...");

    // Get background parameter (true/false), default is false for clean view
    const {
      background = "false",
      category_name: categoryQuery,
      page = "1",
    } = req.query;
    const useBackground = background === "true";
    const pageNum = parseInt(page) || 1;

    console.log(
      `📄 Generating wholesale price table with background: ${useBackground}, page: ${pageNum}`
    );

    // For background mode, use the old card-style layout
    if (useBackground) {
      return generateWholesalePriceTableWithBackground(req, res);
    }

    // For standard mode (clean view), show all products without categories
    console.log(
      `📦 Generating clean wholesale price table for page ${pageNum}...`
    );

    let query = supabase
      .from("view_product")
      .select(
        "full_name, description, cost, base_price, category_name, category_rank"
      )
      .not("cost", "is", null) // Ensure cost is not null for wholesale price calculation
      .eq("glt_visible", true); // Only visible products

    // Apply category filter if provided
    if (categoryQuery) {
      console.log(`Filtering by category: ${categoryQuery}`);
      query = query.eq("category_name", categoryQuery);
    }

    const { data: productsData, error: productsError } = await query.order(
      "category_rank, cost"
    );

    if (productsError) {
      console.error(
        "Error fetching products for wholesale table:",
        productsError
      );
      return res.status(500).send("Error fetching product data");
    }

    if (!productsData || productsData.length === 0) {
      return res
        .status(404)
        .send("No products found for wholesale price table.");
    }

    // Calculate wholesale price (cost + 800) and prepare products for template
    const products = productsData.map((p) => ({
      ...p,
      wholesale_price: p.cost + 800,
      description: p.description || "Mô tả sản phẩm", // Default description if empty
    }));

    console.log(
      `✅ Found ${products.length} products for wholesale price table`
    );

    // Group products by category
    const categoryMap = new Map();
    products.forEach((product) => {
      if (!categoryMap.has(product.category_name)) {
        categoryMap.set(product.category_name, {
          name: product.category_name,
          rank: product.category_rank,
          products: [],
        });
      }
      categoryMap.get(product.category_name).products.push({
        full_name: product.full_name,
        description: product.description,
        wholesale_price: product.wholesale_price,
      });
    });

    // Sort products by cost within each category
    categoryMap.forEach((category) => {
      category.products.sort(
        (a, b) => (a.wholesale_price || 0) - (b.wholesale_price || 0)
      );
    });

    const allProductCategories = Array.from(categoryMap.values())
      .filter((category) => category.products.length > 0)
      .sort((a, b) => a.rank - b.rank); // Sort by category rank

    // Split categories into 2 pages
    const totalCategories = allProductCategories.length;
    const categoriesPerPage = Math.ceil(totalCategories / 2);

    let productCategories = [];
    if (pageNum === 1) {
      productCategories = allProductCategories.slice(0, categoriesPerPage);
    } else if (pageNum === 2) {
      productCategories = allProductCategories.slice(categoriesPerPage);
    } else {
      // Default to page 1 if invalid page number
      productCategories = allProductCategories.slice(0, categoriesPerPage);
    }

    console.log(
      `📄 Page ${pageNum}: Showing ${productCategories.length} categories out of ${totalCategories} total`
    );

    // Get current date in Vietnamese format
    const now = new Date();
    const currentDate = now.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Read template file - using the new clean wholesale template
    const templatePath = path.join(
      __dirname,
      "../views/templates/price-table-whole.html"
    );
    const templateContent = await fs.readFile(templatePath, "utf-8");

    // Compile template
    const template = Handlebars.compile(templateContent);

    // Render template with data
    const html = template({
      pageTitle: `BẢNG GIÁ SỈ - TRANG ${pageNum}`,
      currentDate,
      categories: productCategories,
    });

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error("Error generating wholesale price table:", error);
    res.status(500).send("Error generating wholesale price table");
  }
};

/**
 * Generate wholesale price table with background (card-style layout)
 * This is the original implementation for background mode
 */
const generateWholesalePriceTableWithBackground = async (req, res) => {
  try {
    const { category_name: categoryQuery } = req.query;

    let query = supabase
      .from("view_product")
      .select(
        "full_name, description, cost, base_price, category_name, category_rank, glt_color_border"
      )
      .not("cost", "is", null); // Ensure cost is not null for wholesale price calculation

    if (categoryQuery) {
      console.log(`Filtering by category: ${categoryQuery}`);
      query = query.eq("category_name", categoryQuery);
    }

    const { data: productsData, error: productsError } = await query.order(
      "category_rank, cost"
    );

    if (productsError) {
      console.error(
        "Error fetching products for wholesale table:",
        productsError
      );
      return res.status(500).send("Error fetching product data");
    }

    if (!productsData || productsData.length === 0) {
      return res
        .status(404)
        .send("No products found for wholesale price table.");
    }

    const products = productsData.map((p) => ({
      ...p,
      wholesale_price: p.cost + 800,
    }));

    // Group products by category
    const productsByCategory = products.reduce((acc, product) => {
      const category = product.category_name || "Uncategorized";
      if (!acc[category]) {
        acc[category] = {
          name: category,
          rank: product.category_rank,
          color: product.glt_color_border,
          products: [],
        };
      }
      acc[category].products.push(product);
      return acc;
    }, {});

    let categoriesArray = Object.values(productsByCategory);
    categoriesArray.sort((a, b) => (a.rank || 999) - (b.rank || 999)); // Sort by rank

    // If only one category, use its name for the card header
    // Otherwise, use a generic title or the first category's name if filtered
    let cardCategoryName = "Bảng Giá Sỉ";
    if (categoriesArray.length === 1) {
      cardCategoryName = categoriesArray[0].name;
    } else if (categoryQuery) {
      cardCategoryName = categoryQuery; // Use the queried category name if multiple match (should not happen with eq filter)
    }

    let displayProducts = [];
    if (categoryQuery && productsByCategory[categoryQuery]) {
      displayProducts = productsByCategory[categoryQuery].products;
      cardCategoryName = categoryQuery;
    } else if (categoriesArray.length > 0) {
      displayProducts = categoriesArray[0].products;
      cardCategoryName = categoriesArray[0].name;
    }

    // Get current date in Vietnamese format
    const now = new Date();
    const currentDate = now.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const templatePath = path.join(
      __dirname,
      "../views/templates/price-table-whole-background.html"
    );
    const templateContent = await fs.readFile(templatePath, "utf-8");
    const template = Handlebars.compile(templateContent);

    const html = template({
      categoryName: cardCategoryName,
      products: displayProducts,
      currentDate,
    });

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error(
      "Error generating wholesale price table with background:",
      error
    );
    res
      .status(500)
      .send("Error generating wholesale price table with background");
  }
};
