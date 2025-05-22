/**
 * Simple script to generate a price table image for a single category
 * This is a simplified version that doesn't rely on complex logic
 */

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs").promises;
// const { execSync } = require("child_process"); // No longer using execSync for server check
const http = require("http"); // Using http for server check

// Check if a server is running on port 3001
async function isServerRunning() {
  console.log(
    "[isServerRunning] Checking server status at http://localhost:3001/ via http.get"
  );
  return new Promise((resolve) => {
    const request = http.get("http://localhost:3001/", (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          console.log(
            "[isServerRunning] Server is responsive (status code: " +
              res.statusCode +
              ")."
          );
          resolve(true);
        } else {
          console.error(
            "[isServerRunning] Server responded with status: " + res.statusCode
          );
          resolve(false);
        }
      });
    });

    request.on("error", (err) => {
      console.error(
        "[isServerRunning] Server check failed (http.get error):",
        err.message
      );
      resolve(false);
    });

    request.setTimeout(5000, () => {
      // 5-second timeout for the http request itself
      console.error(
        "[isServerRunning] Server check timed out after 5 seconds."
      );
      request.destroy(); // Destroy the request to prevent further processing
      resolve(false);
    });
  });
}

async function generatePriceTableImage(categoryId) {
  if (!categoryId) {
    throw new Error("Category ID is required");
  }

  console.log(`🚀 Generating price table image for category ID: ${categoryId}`);

  // Make sure server is running
  if (!(await isServerRunning())) {
    // Await the async isServerRunning
    console.error(
      "❌ Server is not running on port 3001 or not responding. Please ensure 'npm start' is active and the server is healthy."
    );
    throw new Error("Server not running or not responsive");
  }

  let browser;
  console.log("🔧 Preparing to launch Puppeteer...");

  try {
    // Ensure output directory exists
    const outputDir = path.join(__dirname, "../../src/output");
    await fs.mkdir(outputDir, { recursive: true });

    // Generate output filename
    const outputPath = path.join(
      outputDir,
      `price-table-category-${categoryId}.jpg`
    );

    const puppeteerArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      // Consider adding these for WSL if problems persist, though bundled usually handles it well
      // "--single-process",
      // "--disable-features=site-per-process"
    ];

    console.log(`🌐 Launching browser with args: ${puppeteerArgs.join(" ")}`);
    browser = await puppeteer.launch({
      headless: "new",
      args: puppeteerArgs,
    });
    console.log("✅ Browser launched successfully.");

    // Create a new page
    const page = await browser.newPage();
    console.log("📄 New page created.");

    // Set viewport size
    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 1,
    });
    console.log("📐 Viewport set to 1200x1600 with deviceScaleFactor 1.");

    // Build the URL
    const url = `http://localhost:3001/print/price-table/retail?background=true&category=${categoryId}`;
    console.log(`🔗 Navigating to: ${url}`);

    // Navigate to the page
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000, // 30 seconds for page navigation
    });
    console.log("✅ Navigation successful.");

    // Wait for content to be fully rendered
    console.log("⏳ Waiting for additional rendering (2s)...");
    await page.waitForTimeout(2000);

    // Take screenshot
    console.log("📸 Taking screenshot...");
    await page.screenshot({
      path: outputPath,
      quality: 90,
      type: "jpeg",
      // fullPage: true, // Removed to capture viewport dimensions
    });

    console.log(`✅ Screenshot saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("❌ Error during Puppeteer operations:", error);
    throw error;
  } finally {
    if (browser) {
      console.log("🔚 Closing browser...");
      await browser.close();
      console.log("✅ Browser closed.");
    }
  }
}

// Execute if called directly
if (require.main === module) {
  // Get the category ID from command line arguments
  const categoryId = process.argv[2];

  if (!categoryId) {
    console.error("❌ Please provide a category ID as an argument");
    console.log("Usage: node generate-price-table-image.js CATEGORY_ID");
    process.exit(1);
  }

  generatePriceTableImage(categoryId)
    .then((outputPath) => {
      console.log(
        `✅ Script finished. Successfully generated image at: ${outputPath}`
      );
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Script failed to generate image:", error.message);
      process.exit(1);
    });
}

module.exports = { generatePriceTableImage, isServerRunning };
