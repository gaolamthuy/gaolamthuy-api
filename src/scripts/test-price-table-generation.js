/**
 * Manual test script for price table generation
 * Usage: node src/scripts/test-price-table-generation.js
 */

require("dotenv").config();
const priceTableService = require("../services/priceTableService");

async function testPriceTableGeneration() {
  console.log("🧪 Starting manual price table generation test...");
  console.log("⏰ Started at:", new Date().toISOString());

  try {
    const result = await priceTableService.generatePriceTableImagesCore();

    console.log("\n📊 Test Results:");
    console.log("================");
    console.log("Success:", result.success);
    console.log("Message:", result.message);

    if (result.totalCategories !== undefined) {
      console.log("Total Categories:", result.totalCategories);
      console.log("Success Count:", result.successCount);
      console.log("Failure Count:", result.failureCount);
      console.log("Duration:", Math.round(result.duration / 1000) + "s");
    }

    if (result.skipped) {
      console.log("⚠️ Generation was skipped (already in progress)");
    }

    if (result.results && result.results.length > 0) {
      console.log("\n📋 Detailed Results:");
      result.results.forEach((item, index) => {
        const status = item.status === "success" ? "✅" : "❌";
        console.log(
          `${status} ${item.category} (${item.type}) - ${item.imageName}`
        );
        if (item.error) {
          console.log(`   Error: ${item.error}`);
        }
      });
    }

    console.log("\n🔍 Service Health Check:");
    const health = priceTableService.healthCheck();
    console.log("Status:", health.status);
    console.log("Is Generating:", health.isGenerating);
    console.log("Last Run:", health.lastRunTimestamp || "Never");
    if (health.warning) {
      console.log("⚠️ Warning:", health.warning);
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
    console.error("Stack trace:", error.stack);
  }

  console.log("\n⏰ Completed at:", new Date().toISOString());
  process.exit(0);
}

// Run the test
testPriceTableGeneration();
