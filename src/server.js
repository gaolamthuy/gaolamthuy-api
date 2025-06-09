/**
 * Server Entry Point
 * Starts the HTTP server and sets up scheduled tasks
 */

const app = require("./app");
const cron = require("node-cron");
const kiotvietService = require("./services/kiotvietService");
const { getTodayComponents, formatYMD } = require("./utils/dateUtils");
const discordService = require("./services/discordService");
const axios = require("axios");
const mediaController = require("./controllers/mediaController");
const priceTableService = require("./services/priceTableService");

// Schedule price table generation job
const schedulePriceTableGeneration = () => {
  // Price table generation - Every day at 3 AM (after KiotViet sync)
  console.log("🕒 Scheduling price table generation at 3 AM");
  cron.schedule(
    "0 3 * * *",
    async () => {
      console.log(
        "🖼️ [CRON] Starting scheduled price table image generation..."
      );
      try {
        // Generate retail price table images (6 images - one per category)
        console.log("🛍️ [CRON] Starting retail price table generation...");
        const retailResult =
          await priceTableService.generateRetailPriceTableImagesCore();

        // Generate wholesale price table images (2 pages)
        console.log("📦 [CRON] Starting wholesale price table generation...");
        const wholesaleResult =
          await priceTableService.generateWholesalePriceTableImagesCore();

        const totalSuccess =
          (retailResult.successCount || 0) +
          (wholesaleResult.successCount || 0);
        const totalFailures =
          (retailResult.failureCount || 0) +
          (wholesaleResult.failureCount || 0);
        const totalDuration =
          (retailResult.duration || 0) + (wholesaleResult.duration || 0);

        if (retailResult.success && wholesaleResult.success) {
          console.log(
            `✅ [CRON] Price table generation completed successfully`
          );
          console.log(
            `📊 [CRON] Generated 8 images total: 6 retail + 2 wholesale pages`
          );
          console.log(
            `📈 [CRON] Success: ${totalSuccess}, Failures: ${totalFailures}`
          );
          console.log(
            `⏱️ [CRON] Duration: ${Math.round(totalDuration / 1000)}s`
          );

          // Update manifest after successful price table generation
          try {
            await mediaController.updateImageManifest();
            console.log(
              "✅ [CRON] Image manifest updated after price table generation"
            );
          } catch (manifestError) {
            console.error(
              "❌ [CRON] Failed to update manifest after price table generation:",
              manifestError.message
            );
          }
        } else {
          console.error("❌ [CRON] Price table generation had failures:");
          if (!retailResult.success) {
            console.error(
              "[CRON] Retail generation failed:",
              retailResult.message
            );
          }
          if (!wholesaleResult.success) {
            console.error(
              "[CRON] Wholesale generation failed:",
              wholesaleResult.message
            );
          }
        }
      } catch (error) {
        console.error(
          "❌ [CRON] Unexpected error during scheduled price table generation:",
          error.message
        );
        console.error("[CRON] Stack trace:", error.stack);
      }
    },
    {
      timezone: process.env.TIMEZONE || "Asia/Ho_Chi_Minh",
    }
  );
};

// Schedule KiotViet data sync jobs
const scheduleKiotVietSyncJobs = () => {
  // Token refresh - Every day at 1 AM
  console.log("🕒 Scheduling KiotViet token refresh at 1 AM");
  cron.schedule(
    "0 1 * * *",
    async () => {
      console.log("🔄 Refreshing KiotViet access token...");
      try {
        await kiotvietService.refreshKiotVietToken();
        console.log("✅ KiotViet token refreshed successfully");
      } catch (err) {
        console.error("❌ Failed to refresh KiotViet token:", err);
      }
    },
    {
      timezone: process.env.TIMEZONE || "Asia/Ho_Chi_Minh",
    }
  );

  // All other services sync - Every day at 2 AM
  console.log("🕒 Scheduling all KiotViet services sync at 2 AM");
  cron.schedule(
    "0 2 * * *",
    async () => {
      console.log("🔄 Running KiotViet services sync");
      try {
        // Products and Pricebooks
        console.log("📦 Syncing products and pricebooks...");
        await kiotvietService.cloneProducts();
        await kiotvietService.clonePricebooks();

        // Customers
        console.log("👥 Syncing customers...");
        await kiotvietService.cloneCustomers();

        // Today's invoices
        console.log("🧾 Syncing today's invoices...");
        const { year, month, day } = getTodayComponents();
        await kiotvietService.cloneInvoicesByDay(year, month, day);

        // Purchase orders
        console.log("📝 Syncing recent purchase orders...");
        await kiotvietService.cloneRecentPurchaseOrders();

        console.log("✅ All KiotViet services sync completed successfully");

        // Generate Price Table Images after successful sync
        console.log("🖼️ Starting price table image generation...");
        try {
          // Generate retail price table images (6 images - one per category)
          console.log("🛍️ Starting retail price table generation...");
          const retailResult =
            await priceTableService.generateRetailPriceTableImagesCore();

          // Generate wholesale price table images (2 pages)
          console.log("📦 Starting wholesale price table generation...");
          const wholesaleResult =
            await priceTableService.generateWholesalePriceTableImagesCore();

          const totalSuccess =
            (retailResult.successCount || 0) +
            (wholesaleResult.successCount || 0);
          const totalFailures =
            (retailResult.failureCount || 0) +
            (wholesaleResult.failureCount || 0);
          const totalDuration =
            (retailResult.duration || 0) + (wholesaleResult.duration || 0);

          if (retailResult.success && wholesaleResult.success) {
            console.log(`✅ Price table generation completed successfully`);
            console.log(
              `📊 Generated 8 images total: 6 retail + 2 wholesale pages`
            );
            console.log(
              `📈 Success: ${totalSuccess}, Failures: ${totalFailures}`
            );
            console.log(`⏱️ Duration: ${Math.round(totalDuration / 1000)}s`);

            // Update manifest after successful price table generation
            try {
              await mediaController.updateImageManifest();
              console.log(
                "✅ Image manifest updated after price table generation"
              );
            } catch (manifestError) {
              console.error(
                "❌ Failed to update manifest after price table generation:",
                manifestError.message
              );
            }
          } else {
            console.error("❌ Price table generation had failures:");
            if (!retailResult.success) {
              console.error("Retail generation failed:", retailResult.message);
            }
            if (!wholesaleResult.success) {
              console.error(
                "Wholesale generation failed:",
                wholesaleResult.message
              );
            }
          }
        } catch (genError) {
          console.error(
            "❌ Unexpected error during price table image generation:",
            genError.message
          );
          console.error("Stack trace:", genError.stack);
        }
      } catch (err) {
        console.error(
          "❌ Error during KiotViet services sync (or subsequent price table generation):",
          err
        );
      }
    },
    {
      timezone: process.env.TIMEZONE || "Asia/Ho_Chi_Minh",
    }
  );
};

// Start the Discord bot if token is available
const startDiscordBot = () => {
  if (process.env.DISCORD_BOT_TOKEN) {
    console.log("🤖 Discord bot token found, starting bot...");
    discordService.startBot();
  } else {
    console.log("ℹ️ Discord bot token not found, skipping bot initialization");
  }
};

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  scheduleKiotVietSyncJobs();
  schedulePriceTableGeneration();
  startDiscordBot();
});

/**
 * Manually testing refreshKiotVietToken()
 */
// if (process.env.NODE_ENV === 'dev-hot' && process.env.TEST_KV_TOKEN_REFRESH === '1') {
//   (async () => {
//     console.log('🔥 Manually testing refreshKiotVietToken()');
//     await kiotvietService.refreshKiotVietToken();
//     process.exit(0); // optional: auto exit after test
//   })();
// }
