/**
 * Script to generate price table images for all active categories
 * This runs each category one by one to avoid memory issues
 */

const { createClient } = require("@supabase/supabase-js");
const {
  generatePriceTableImage,
  isServerRunning: isSingleImageScriptServerRunning,
} = require("./generate-price-table-image");
// const { execSync } = require("child_process"); // No longer used for server check directly here
const http = require("http"); // For consistency, or could keep generate-price-table-image.js self-contained
require("dotenv").config();

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Use the imported isServerRunning check
async function isServerRunning() {
  // Adding a distinct console log for this script context
  console.log(
    "[generate-all-price-tables] Delegating server check to generate-price-table-image.js script."
  );
  return isSingleImageScriptServerRunning();
}

async function generateAllPriceTables() {
  console.log(
    "🎨 Starting generation of price table images for all active categories"
  );

  // Make sure server is running
  if (!(await isServerRunning())) {
    // Await the async isServerRunning
    console.error(
      "❌ Server is not running on port 3001 or not responding. Please ensure 'npm start' is active and the server is healthy."
    );
    process.exit(1); // Exit if server isn't up, as this script is CLI-driven
  }

  try {
    // Fetch all active categories
    const { data: categories, error } = await supabase
      .from("kv_product_categories")
      .select("category_id, category_name")
      .eq("glt_is_active", true)
      .order("rank");

    if (error) {
      throw new Error(`Error fetching categories: ${error.message}`);
    }

    console.log(`📋 Found ${categories.length} active categories`);

    // Process each category one by one
    const results = [];
    const startTime = Date.now();

    for (const category of categories) {
      console.log(
        `🖼️ Processing category: ${category.category_name} (ID: ${category.category_id})`
      );

      try {
        const outputPath = await generatePriceTableImage(category.category_id);

        results.push({
          category_id: category.category_id,
          category_name: category.category_name,
          output_path: outputPath,
          success: true,
        });

        console.log(
          `✅ Successfully generated image for ${category.category_name}`
        );
      } catch (categoryError) {
        console.error(
          `❌ Error processing category ${category.category_name}:`,
          categoryError
        );

        results.push({
          category_id: category.category_id,
          category_name: category.category_name,
          error: categoryError.message,
          success: false,
        });
      }

      // Sleep for 2 seconds between categories to allow resources to be released
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const successCount = results.filter((r) => r.success).length;

    console.log(
      `✨ Finished generating ${successCount} out of ${categories.length} price table images in ${totalTime}s`
    );
    console.log(
      `📊 Success rate: ${Math.round(
        (successCount / categories.length) * 100
      )}%`
    );

    return {
      success: true,
      total: categories.length,
      successful: successCount,
      execution_time_seconds: totalTime,
      results,
    };
  } catch (error) {
    console.error("❌ Error generating price table images:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Execute if called directly
if (require.main === module) {
  generateAllPriceTables()
    .then((result) => {
      console.log("✅ All done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Fatal error:", error);
      process.exit(1);
    });
}

module.exports = { generateAllPriceTables };
