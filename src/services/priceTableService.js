const { createClient } = require("@supabase/supabase-js");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { uploadToS3 } = require("../utils/s3");

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Global flags to prevent concurrent runs
let isGenerating = false;
let isGeneratingRetail = false;
let isGeneratingWholesale = false;
let lastRunTimestamp = null;
let lastRunResults = null;

/**
 * Generate price table images for all active categories (core business logic)
 * This function doesn't depend on Express req/res and can be used by cron jobs
 */
async function generatePriceTableImagesCore() {
  // Prevent concurrent runs
  if (isGenerating) {
    console.log("⚠️ Price table generation already in progress, skipping...");
    return {
      success: false,
      message: "Generation already in progress",
      skipped: true,
    };
  }

  isGenerating = true;
  const startTime = Date.now();
  console.log(
    "🚀 Starting batch price table image generation for all active categories..."
  );

  try {
    // Always fetch all active categories for batch processing
    const { data: activeCategories, error } = await supabase
      .from("kv_product_categories")
      .select("category_id, category_name, glt_is_active")
      .eq("glt_is_active", true)
      .order("rank");

    if (error) {
      console.error("❌ Error fetching active categories:", error);
      throw new Error(`Failed to fetch active categories: ${error.message}`);
    }

    if (activeCategories.length === 0) {
      console.log("ℹ️ No active categories found to process");
      return {
        success: true,
        message: "No active categories to process",
        totalCategories: 0,
        results: [],
        duration: Date.now() - startTime,
      };
    }

    console.log(
      `📊 Found ${activeCategories.length} active categories to process`
    );

    const results = [];
    const PORT = process.env.PORT || 3001;
    let successCount = 0;
    let failureCount = 0;

    for (const [index, category] of activeCategories.entries()) {
      console.log(
        `📸 Processing category ${index + 1}/${activeCategories.length}: ${
          category.category_name
        } (ID: ${category.category_id})`
      );

      // Use category_id for filename and .jpeg extension
      const retailImageName = `price-table-retail-${category.category_id}.jpeg`;
      const wholeImageName = `price-table-whole-${category.category_id}.jpeg`;

      // Generate Retail Price Table Image
      const retailUrl = `http://localhost:${PORT}/print/price-table/retail?background=true&category=${category.category_id}`;
      try {
        await capturePriceTableScreenshotWithRetry(
          retailUrl,
          category.category_name,
          retailImageName,
          "retail",
          3 // max retries
        );
        results.push({
          category: category.category_name,
          categoryId: category.category_id,
          type: "retail",
          imageName: retailImageName,
          status: "success",
        });
        successCount++;
        console.log(
          `✅ Retail price table generated for ${category.category_name}`
        );
      } catch (error) {
        console.error(
          `❌ Error generating retail price table for ${category.category_name}:`,
          error.message
        );
        results.push({
          category: category.category_name,
          categoryId: category.category_id,
          type: "retail",
          imageName: retailImageName,
          status: "failed",
          error: error.message,
        });
        failureCount++;
      }

      // Generate Wholesale Price Table Image
      const wholeUrl = `http://localhost:${PORT}/print/price-table/whole?category_name=${encodeURIComponent(
        category.category_name
      )}`;
      try {
        await capturePriceTableScreenshotWithRetry(
          wholeUrl,
          category.category_name,
          wholeImageName,
          "wholesale",
          3 // max retries
        );
        results.push({
          category: category.category_name,
          categoryId: category.category_id,
          type: "wholesale",
          imageName: wholeImageName,
          status: "success",
        });
        successCount++;
        console.log(
          `✅ Wholesale price table generated for ${category.category_name}`
        );
      } catch (error) {
        console.error(
          `❌ Error generating wholesale price table for ${category.category_name}:`,
          error.message
        );
        results.push({
          category: category.category_name,
          categoryId: category.category_id,
          type: "wholesale",
          imageName: wholeImageName,
          status: "failed",
          error: error.message,
        });
        failureCount++;
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      message: "Price table image generation process completed",
      totalCategories: activeCategories.length,
      successCount,
      failureCount,
      duration,
      results,
    };

    // Store last run results for monitoring
    lastRunTimestamp = new Date().toISOString();
    lastRunResults = summary;

    console.log(`✅ Price table generation completed in ${duration}ms`);
    console.log(`📊 Success: ${successCount}, Failures: ${failureCount}`);

    return summary;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("❌ Error generating price table images:", error.message);

    const errorResult = {
      success: false,
      message: "Error generating price table images",
      error: error.message,
      duration,
    };

    lastRunTimestamp = new Date().toISOString();
    lastRunResults = errorResult;

    throw error;
  } finally {
    isGeneratingRetail = false;
  }
}

/**
 * Capture screenshot with retry logic
 */
async function capturePriceTableScreenshotWithRetry(
  url,
  categoryName,
  outputImageName,
  type,
  maxRetries = 3
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `📸 Attempt ${attempt}/${maxRetries}: Capturing ${type} price table for ${categoryName}`
      );
      await capturePriceTableScreenshot(
        url,
        categoryName,
        outputImageName,
        type
      );
      return; // Success, exit retry loop
    } catch (error) {
      lastError = error;
      console.error(
        `❌ Attempt ${attempt}/${maxRetries} failed for ${categoryName} (${type}):`,
        error.message
      );

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError; // All retries failed
}

/**
 * Capture screenshot of the price table HTML page
 * @param {string} url - URL of the price table HTML page
 * @param {string} categoryName - Name of the category for logging
 * @param {string} outputImageName - Desired output name for the image (e.g., price-table-retail-123.jpeg)
 * @param {string} type - Type of price table (e.g., "retail", "wholesale")
 */
async function capturePriceTableScreenshot(
  url,
  categoryName,
  outputImageName,
  type
) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
      defaultViewport: { width: 1200, height: 1600 },
    });

    const page = await browser.newPage();

    // Set longer timeout for page load
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 45000,
    });

    const imagePath = path.join(
      __dirname,
      "../../uploads/temp",
      outputImageName
    );

    const tempDir = path.dirname(imagePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await page.screenshot({
      path: imagePath,
      fullPage: false,
      type: "jpeg",
      quality: 85,
    });

    console.log(`🖼️ Screenshot saved to ${imagePath}`);

    const s3Key = `price-tables/${outputImageName}`;
    await uploadToS3(imagePath, outputImageName, s3Key, "image/jpeg");
    console.log(`☁️ Screenshot ${outputImageName} uploaded to S3 at ${s3Key}`);

    // Clean up local file
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      console.log(`🗑️ Deleted temporary screenshot: ${imagePath}`);
    }
  } catch (error) {
    console.error(
      `❌ Error capturing ${type} price table for ${categoryName} from ${url}:`,
      error.message
    );
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Get the status of the last price table generation run
 */
function getLastRunStatus() {
  return {
    isGenerating,
    lastRunTimestamp,
    lastRunResults,
  };
}

/**
 * Health check for price table generation service
 */
function healthCheck() {
  const now = new Date();
  const status = {
    service: "priceTableService",
    status: "healthy",
    isGenerating,
    lastRunTimestamp,
    uptimeSeconds: process.uptime(),
  };

  // Check if last run was too long ago (more than 25 hours)
  if (lastRunTimestamp) {
    const lastRun = new Date(lastRunTimestamp);
    const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);

    if (hoursSinceLastRun > 25) {
      status.status = "warning";
      status.warning = `Last run was ${Math.round(
        hoursSinceLastRun
      )} hours ago`;
    }
  } else {
    status.status = "warning";
    status.warning = "No previous runs recorded";
  }

  return status;
}

/**
 * Generate retail price table images for all active categories
 * Uses card-style layout for each category
 */
async function generateRetailPriceTableImagesCore() {
  // Prevent concurrent runs
  if (isGeneratingRetail) {
    console.log(
      "⚠️ Retail price table generation already in progress, skipping..."
    );
    return {
      success: false,
      message: "Retail generation already in progress",
      skipped: true,
    };
  }

  isGeneratingRetail = true;
  const startTime = Date.now();
  console.log(
    "🛍️ Starting retail price table image generation for all active categories..."
  );

  try {
    // Fetch all active categories
    const { data: activeCategories, error } = await supabase
      .from("kv_product_categories")
      .select("category_id, category_name, glt_is_active")
      .eq("glt_is_active", true)
      .order("rank");

    if (error) {
      console.error("❌ Error fetching active categories:", error);
      throw new Error(`Failed to fetch active categories: ${error.message}`);
    }

    if (activeCategories.length === 0) {
      console.log("ℹ️ No active categories found to process");
      return {
        success: true,
        message: "No active categories to process",
        totalCategories: 0,
        results: [],
        duration: Date.now() - startTime,
      };
    }

    console.log(
      `📊 Found ${activeCategories.length} active categories to process for retail`
    );

    const results = [];
    const PORT = process.env.PORT || 3001;
    let successCount = 0;
    let failureCount = 0;

    for (const [index, category] of activeCategories.entries()) {
      console.log(
        `📸 Processing retail category ${index + 1}/${
          activeCategories.length
        }: ${category.category_name} (ID: ${category.category_id})`
      );

      const imageName = `price-table-retail-${category.category_id}.jpeg`;
      const url = `http://localhost:${PORT}/print/price-table/retail?background=true&category=${category.category_id}`;

      try {
        await captureRetailPriceTableScreenshot(
          url,
          category.category_name,
          imageName,
          3 // max retries
        );

        // Upload to R2 with price-table/ prefix
        const outputPath = path.join(__dirname, "../output", imageName);
        try {
          const uploadResult = await uploadToS3(
            outputPath,
            imageName,
            `price-tables/${imageName}`
          );
          console.log(`✅ Uploaded ${imageName} to R2: ${uploadResult.url}`);

          results.push({
            category: category.category_name,
            categoryId: category.category_id,
            type: "retail",
            imageName: imageName,
            status: "success",
            r2Url: uploadResult.url,
            r2Key: uploadResult.key,
          });
        } catch (uploadError) {
          console.error(
            `❌ Error uploading ${imageName} to R2:`,
            uploadError.message
          );
          results.push({
            category: category.category_name,
            categoryId: category.category_id,
            type: "retail",
            imageName: imageName,
            status: "upload_failed",
            error: uploadError.message,
          });
          failureCount++;
          continue;
        }

        successCount++;
        console.log(
          `✅ Retail price table generated and uploaded for ${category.category_name}`
        );
      } catch (error) {
        console.error(
          `❌ Error generating retail price table for ${category.category_name}:`,
          error.message
        );
        results.push({
          category: category.category_name,
          categoryId: category.category_id,
          type: "retail",
          imageName: imageName,
          status: "failed",
          error: error.message,
        });
        failureCount++;
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      message: "Retail price table image generation completed",
      totalCategories: activeCategories.length,
      successCount,
      failureCount,
      duration,
      results,
    };

    // Store last run results for monitoring
    lastRunTimestamp = new Date().toISOString();
    lastRunResults = summary;

    console.log(`✅ Retail price table generation completed in ${duration}ms`);
    console.log(`📊 Success: ${successCount}, Failures: ${failureCount}`);

    return summary;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      "❌ Error generating retail price table images:",
      error.message
    );

    const errorResult = {
      success: false,
      message: "Error generating retail price table images",
      error: error.message,
      duration,
    };

    lastRunTimestamp = new Date().toISOString();
    lastRunResults = errorResult;

    throw error;
  } finally {
    isGenerating = false;
  }
}

/**
 * Generate wholesale price table images
 * Uses clean layout that captures the full page with all products
 */
async function generateWholesalePriceTableImagesCore() {
  // Prevent concurrent runs
  if (isGeneratingWholesale) {
    console.log(
      "⚠️ Wholesale price table generation already in progress, skipping..."
    );
    return {
      success: false,
      message: "Wholesale generation already in progress",
      skipped: true,
    };
  }

  isGeneratingWholesale = true;
  const startTime = Date.now();
  console.log(
    "📦 Starting wholesale price table image generation (2 pages)..."
  );

  try {
    const results = [];
    const PORT = process.env.PORT || 3001;
    let successCount = 0;
    let failureCount = 0;

    // Generate 2 wholesale price table images (split into pages)
    const pages = [
      { pageNum: 1, imageName: `price-table-wholesale-page-1.jpeg` },
      { pageNum: 2, imageName: `price-table-wholesale-page-2.jpeg` },
    ];

    for (const page of pages) {
      const url = `http://localhost:${PORT}/print/price-table/whole?page=${page.pageNum}`;

      console.log(`📸 Generating wholesale price table page ${page.pageNum}`);

      try {
        await captureWholesalePriceTableScreenshot(
          url,
          `Wholesale Page ${page.pageNum}`,
          page.imageName,
          3 // max retries
        );

        // Upload to R2 with price-table/ prefix
        const outputPath = path.join(__dirname, "../output", page.imageName);
        try {
          const uploadResult = await uploadToS3(
            outputPath,
            page.imageName,
            `price-tables/${page.imageName}`
          );
          console.log(
            `✅ Uploaded ${page.imageName} to R2: ${uploadResult.url}`
          );

          results.push({
            category: `Wholesale Page ${page.pageNum}`,
            categoryId: `page-${page.pageNum}`,
            type: "wholesale",
            imageName: page.imageName,
            status: "success",
            r2Url: uploadResult.url,
            r2Key: uploadResult.key,
          });
        } catch (uploadError) {
          console.error(
            `❌ Error uploading ${page.imageName} to R2:`,
            uploadError.message
          );
          results.push({
            category: `Wholesale Page ${page.pageNum}`,
            categoryId: `page-${page.pageNum}`,
            type: "wholesale",
            imageName: page.imageName,
            status: "upload_failed",
            error: uploadError.message,
          });
          failureCount++;
          continue;
        }

        successCount++;
        console.log(
          `✅ Wholesale price table page ${page.pageNum} generated and uploaded successfully`
        );
      } catch (error) {
        console.error(
          `❌ Error generating wholesale price table page ${page.pageNum}:`,
          error.message
        );
        results.push({
          category: `Wholesale Page ${page.pageNum}`,
          categoryId: `page-${page.pageNum}`,
          type: "wholesale",
          imageName: page.imageName,
          status: "failed",
          error: error.message,
        });
        failureCount++;
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      message: "Wholesale price table image generation completed (2 pages)",
      totalPages: 2,
      successCount,
      failureCount,
      duration,
      results,
    };

    // Store last run results for monitoring
    lastRunTimestamp = new Date().toISOString();
    lastRunResults = summary;

    console.log(
      `✅ Wholesale price table generation completed in ${duration}ms`
    );
    console.log(`📊 Success: ${successCount}, Failures: ${failureCount}`);

    return summary;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      "❌ Error generating wholesale price table images:",
      error.message
    );

    const errorResult = {
      success: false,
      message: "Error generating wholesale price table images",
      error: error.message,
      duration,
    };

    lastRunTimestamp = new Date().toISOString();
    lastRunResults = errorResult;

    throw error;
  } finally {
    isGeneratingWholesale = false;
  }
}

/**
 * Capture retail price table screenshot with special handling for card layout
 */
async function captureRetailPriceTableScreenshot(
  url,
  categoryName,
  outputImageName,
  maxRetries = 3
) {
  let browser;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      console.log(
        `📸 Attempt ${
          retryCount + 1
        }/${maxRetries}: Capturing retail price table screenshot for ${categoryName}`
      );

      // Ensure output directory exists
      const outputDir = path.join(__dirname, "../output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, outputImageName);
      console.log(`📂 Output path: ${outputPath}`);

      // Launch browser
      console.log("🌐 Launching browser...");
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
        ],
      });

      const page = await browser.newPage();

      // Set viewport for retail card layout
      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 2, // Higher DPI for retail cards
      });

      console.log(`🔗 Navigating to: ${url}`);
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      console.log("⏳ Waiting for content to load...");
      await page.waitForSelector(".price-card", { timeout: 15000 });

      // Take screenshot of the card
      console.log("📸 Taking retail card screenshot...");
      await page.screenshot({
        path: outputPath,
        type: "jpeg",
        quality: 85,
        fullPage: false, // For retail cards, we don't need full page
      });

      await browser.close();
      console.log(`✅ Screenshot saved successfully: ${outputPath}`);
      return;
    } catch (error) {
      console.error(`❌ Attempt ${retryCount + 1} failed:`, error.message);

      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error("Error closing browser:", closeError.message);
        }
      }

      retryCount++;

      if (retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(
    `Failed to capture retail price table screenshot after ${maxRetries} attempts`
  );
}

/**
 * Capture wholesale price table screenshot with special handling for full page
 */
async function captureWholesalePriceTableScreenshot(
  url,
  categoryName,
  outputImageName,
  maxRetries = 3
) {
  let browser;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      console.log(
        `📸 Attempt ${
          retryCount + 1
        }/${maxRetries}: Capturing wholesale price table screenshot for ${categoryName}`
      );

      // Ensure output directory exists
      const outputDir = path.join(__dirname, "../output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, outputImageName);
      console.log(`📂 Output path: ${outputPath}`);

      // Launch browser
      console.log("🌐 Launching browser...");
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
        ],
      });

      const page = await browser.newPage();

      // Set viewport for wholesale price table with fixed 1200x1600 size
      await page.setViewport({
        width: 1200,
        height: 1600, // Fixed height for consistent page sizing
        deviceScaleFactor: 1,
      });

      console.log(`🔗 Navigating to: ${url}`);
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      console.log("⏳ Waiting for content to load...");
      await page.waitForSelector(".product-table", { timeout: 15000 });

      // Take screenshot with fixed viewport size (1200x1600)
      console.log("📸 Taking fixed-size screenshot...");
      await page.screenshot({
        path: outputPath,
        type: "jpeg",
        quality: 85,
        fullPage: false, // Use viewport size for consistent 1200x1600 images
      });

      await browser.close();
      console.log(`✅ Screenshot saved successfully: ${outputPath}`);
      return;
    } catch (error) {
      console.error(`❌ Attempt ${retryCount + 1} failed:`, error.message);

      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error("Error closing browser:", closeError.message);
        }
      }

      retryCount++;

      if (retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(
    `Failed to capture wholesale price table screenshot after ${maxRetries} attempts`
  );
}

module.exports = {
  generatePriceTableImagesCore,
  generateRetailPriceTableImagesCore,
  generateWholesalePriceTableImagesCore,
  getLastRunStatus,
  healthCheck,
};
