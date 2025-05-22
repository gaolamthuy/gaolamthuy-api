/**
 * Simple Puppeteer test script for debugging
 */

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs").promises;

async function takeSimpleScreenshot() {
  console.log("🚀 Starting simple Puppeteer test...");
  let browser;

  try {
    // Ensure output directory exists
    const outputDir = path.join(__dirname, "../../output");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "simple-test.jpg");

    // Launch puppeteer using bundled Chromium
    console.log("🌐 Launching browser using bundled Chromium...");
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      // Don't specify executablePath to use bundled browser
    });

    // Log the browser version
    const version = await browser.version();
    console.log(`🌐 Browser version: ${version}`);

    // Open a page and navigate to a simple URL
    const page = await browser.newPage();
    console.log("📝 Opening a new page...");

    // Set viewport
    await page.setViewport({
      width: 800,
      height: 600,
      deviceScaleFactor: 1,
    });

    // Navigate to Google
    console.log("🔗 Navigating to Google...");
    await page.goto("https://www.google.com", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Take a screenshot
    console.log("📸 Taking screenshot...");
    await page.screenshot({
      path: outputPath,
      type: "jpeg",
      quality: 80,
    });

    console.log(`✅ Screenshot saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("❌ Error in simple Puppeteer test:", error);
    throw error;
  } finally {
    if (browser) {
      console.log("🔚 Closing browser");
      await browser.close();
    }
  }
}

// Run the function if called directly
if (require.main === module) {
  takeSimpleScreenshot().catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
}

module.exports = { takeSimpleScreenshot };
