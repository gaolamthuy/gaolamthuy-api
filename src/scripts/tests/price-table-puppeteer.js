/**
 * Test script for rendering price table with Puppeteer
 *
 * This script launches Puppeteer to render the retail price table page
 * with background=true, takes a high-quality screenshot, and saves it.
 */

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs").promises;
const { execSync, spawn } = require("child_process");

/**
 * Renders price table page and takes a screenshot
 */
async function testRenderPriceTableWithPuppeteer(options = {}) {
  console.log("🚀 Starting price table render test with Puppeteer");
  console.log("Options:", JSON.stringify(options, null, 2));

  let browser;
  let serverProcess;
  const startServer = options.startServer || false;
  const timeout = options.timeout || 60000; // Default timeout 60 seconds
  const debug = options.debug || true;

  // Helper function for debug logging
  const debugLog = (message) => {
    if (debug) {
      console.log(`[DEBUG] ${message}`);
    }
  };

  // Set a global timeout to prevent hanging
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeout}ms`));
    }, timeout);
  });

  try {
    // Ensure output directory exists
    const outputDir = path.join(__dirname, "../../output");
    await fs.mkdir(outputDir, { recursive: true });

    // Check if server is running or start it if needed
    let serverRunning = false;
    console.log("🔎 Checking if server is running...");

    try {
      execSync("curl -s http://localhost:3001/ > /dev/null");
      console.log("✅ Server is already running on port 3001");
      serverRunning = true;
    } catch (error) {
      console.log("⚠️ Server is not running on port 3001");

      if (startServer) {
        // Make sure no process is using the port
        try {
          execSync('pkill -f "node index.js" || true');
          console.log("🧹 Cleaned up any existing Node processes");
        } catch (e) {
          // Ignore errors here
        }

        console.log("🚀 Starting server...");
        serverProcess = spawn("node", ["index.js"], {
          detached: false,
          stdio: "pipe",
        });

        // Wait for server to start
        console.log("⏳ Waiting for server to start...");
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Check if server actually started
        try {
          execSync("curl -s http://localhost:3001/ > /dev/null");
          console.log("✅ Server started successfully");
          serverRunning = true;
        } catch (e) {
          console.error(
            "❌ Failed to start server. Please start it manually with 'npm run dev'"
          );
          throw new Error("Server failed to start");
        }
      } else {
        console.error(
          "❌ Server is not running. Please start it with 'npm run dev' or use the startServer option"
        );
        throw new Error("Server not running");
      }
    }

    // Check environment for debugging
    try {
      debugLog("Checking environment for Chrome/Chromium...");
      const chromeLocations = [
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/chrome",
        "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      ];

      for (const loc of chromeLocations) {
        try {
          const exists = await fs
            .stat(loc)
            .then(() => true)
            .catch(() => false);
          debugLog(`${loc}: ${exists ? "Found" : "Not found"}`);
        } catch (e) {
          debugLog(`Error checking ${loc}: ${e.message}`);
        }
      }

      // Check Node.js version
      debugLog(`Node.js version: ${process.version}`);
      debugLog(`Platform: ${process.platform}`);
      debugLog(`WSL: ${process.env.WSL_DISTRO_NAME || "Not detected"}`);
    } catch (envError) {
      console.error("⚠️ Error checking environment:", envError);
    }

    // Launch puppeteer using bundled browser
    console.log("🌐 Launching browser using bundled Chromium...");

    // Special args for WSL
    const isWSL =
      process.env.WSL_DISTRO_NAME ||
      (process.platform === "linux" &&
        execSync("uname -r").toString().includes("microsoft"));

    const puppeteerArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ];

    if (isWSL) {
      debugLog("WSL environment detected, adding special flags");
      puppeteerArgs.push(
        "--single-process",
        "--disable-features=site-per-process",
        "--ignore-certificate-errors"
      );
    }

    debugLog(`Launching with args: ${puppeteerArgs.join(", ")}`);

    try {
      browser = await Promise.race([
        puppeteer.launch({
          headless: "new",
          args: puppeteerArgs,
          // Don't specify executablePath to use bundled browser
        }),
        timeoutPromise,
      ]);

      debugLog("Browser launched successfully");
    } catch (browserError) {
      console.error("❌ Failed to launch browser:", browserError);

      // Try fallback method - using system Chrome/Chromium if available
      if (isWSL) {
        console.log("🔄 Trying to use Windows Chrome via WSL path...");
        const windowsChromePath =
          "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe";

        try {
          browser = await Promise.race([
            puppeteer.launch({
              headless: "new",
              args: puppeteerArgs,
              executablePath: windowsChromePath,
            }),
            timeoutPromise,
          ]);
          console.log("✅ Successfully launched Windows Chrome");
        } catch (winChromeError) {
          console.error("❌ Failed to launch Windows Chrome:", winChromeError);
          throw new Error("All browser launch attempts failed");
        }
      } else {
        throw browserError;
      }
    }

    // Open new page
    debugLog("Opening a new browser page");
    const page = await browser.newPage();

    // Set viewport to exactly 1200x1600
    console.log("📱 Setting viewport to 1200x1600 with scale factor 2");
    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 2, // Higher resolution
    });

    // First check if the price table endpoint exists
    try {
      console.log("🔍 Testing if price table endpoint exists...");
      const testUrl = "http://localhost:3001/print/price-table/retail";
      debugLog(`Navigating to test URL: ${testUrl}`);

      await Promise.race([
        page.goto(testUrl, {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        }),
        timeoutPromise,
      ]);

      const pageStatus = await page.evaluate(() => document.body.innerText);
      debugLog(
        `Page content first 100 chars: ${pageStatus.substring(0, 100)}...`
      );

      if (
        pageStatus.includes("Cannot GET") ||
        pageStatus.includes("Error") ||
        pageStatus.includes("Not Found")
      ) {
        console.error(
          `❌ Price table endpoint not found. Got: ${pageStatus.substring(
            0,
            100
          )}...`
        );
        throw new Error("Price table endpoint not found or returns error");
      }

      console.log("✅ Price table endpoint exists");
    } catch (error) {
      console.error("❌ Error testing price table endpoint:", error.message);
      throw error;
    }

    // Navigate to price table URL
    const categoryParam = options.category
      ? `&category=${options.category}`
      : "";
    const url = `http://localhost:3001/print/price-table/retail?background=true${categoryParam}`;
    console.log(`🔗 Navigating to ${url}`);

    // Race against timeout
    debugLog("Starting page navigation");
    await Promise.race([
      page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000, // 30 second timeout for page load
      }),
      timeoutPromise,
    ]);
    debugLog("Page navigation complete");

    // Wait a bit to ensure all fonts and content are loaded
    await page.waitForTimeout(2000);

    // Take screenshot of just the price-card element if possible
    console.log("📸 Taking screenshot...");
    const priceCard = await page.$(".price-card");

    // Determine output path
    const outputFilename = options.outputPath || "price-table-test.jpg";
    const outputPath = path.join(outputDir, outputFilename);

    if (priceCard) {
      console.log(
        `Found .price-card element, taking screenshot of just this element`
      );

      // Get the bounding box to ensure exact dimensions
      const box = await priceCard.boundingBox();
      debugLog(`Price card bounding box: ${JSON.stringify(box)}`);

      // Clip the screenshot to the exact dimensions of 1200x1600
      await page.screenshot({
        path: outputPath,
        quality: 90,
        type: "jpeg",
        clip: {
          x: box.x,
          y: box.y,
          width: Math.min(box.width, 1200), // Ensure width doesn't exceed 1200
          height: Math.min(box.height, 1600), // Ensure height doesn't exceed 1600
        },
      });
    } else {
      console.log(
        `Could not find .price-card element, taking full page screenshot`
      );

      await page.screenshot({
        path: outputPath,
        quality: 90,
        type: "jpeg",
        fullPage: true,
      });
    }

    console.log(`✅ Screenshot saved to ${outputPath}`);

    // Clear the global timeout
    clearTimeout(timeoutId);

    return outputPath;
  } catch (error) {
    console.error("❌ Error rendering price table:", error);
    throw error;
  } finally {
    // Clear timeout if it's still active
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Close browser
    if (browser) {
      console.log("🔚 Closing browser");
      await browser
        .close()
        .catch((e) => console.error("Error closing browser:", e));
    }

    // Kill server process if we started it
    if (serverProcess) {
      console.log("🛑 Stopping server");
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /pid ${serverProcess.pid} /T /F`);
        } else {
          serverProcess.kill("SIGINT");
        }
      } catch (e) {
        console.error("Error stopping server:", e);
      }
    }
  }
}

// Execute the function if this file is run directly
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    startServer: args.includes("--start-server"),
    category: args.find((arg) => arg.startsWith("--category="))?.split("=")[1],
    outputPath: args.find((arg) => arg.startsWith("--output="))?.split("=")[1],
    timeout: parseInt(
      args.find((arg) => arg.startsWith("--timeout="))?.split("=")[1] || "60000"
    ),
    debug: !args.includes("--no-debug"),
  };

  testRenderPriceTableWithPuppeteer(options).catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
}

// Export the function for use in other modules
module.exports = { testRenderPriceTableWithPuppeteer };
