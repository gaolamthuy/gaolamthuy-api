/**
 * List Categories Script
 *
 * This script connects to the database and lists all available product categories
 * to help identify valid category IDs for the price table generator.
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function listCategories() {
  console.log("📋 Fetching product categories...");

  try {
    // Get active categories
    const { data: categories, error: categoriesError } = await supabase
      .from("kv_product_categories")
      .select("category_id, category_name, rank, glt_is_active")
      .order("rank");

    if (categoriesError) {
      console.error("❌ Error fetching categories:", categoriesError);
      return;
    }

    console.log(`✅ Found ${categories.length} categories\n`);

    // Display categories in a table format
    console.log("ID\t| Active\t| Rank\t| Name");
    console.log("-".repeat(50));

    categories.forEach((cat) => {
      console.log(
        `${cat.category_id}\t| ${cat.glt_is_active ? "✓" : "✗"}\t\t| ${
          cat.rank
        }\t| ${cat.category_name}`
      );
    });

    console.log("\n📝 Usage:");
    console.log("To generate a price table for a specific category:");
    console.log(
      "npm run test:price-table-puppeteer -- --category=<ID> --start-server"
    );
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  listCategories().catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
}

module.exports = { listCategories };
