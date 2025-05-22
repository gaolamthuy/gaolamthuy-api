/**
 * KiotViet Controller
 * Handles KiotViet data cloning operations
 */

const kiotvietService = require("../services/kiotvietService");
const {
  successResponse,
  errorResponse,
  validationError,
  success,
  serverError,
  notFound,
  badRequest,
} = require("../utils/responseHandler");
const {
  getTodayComponents,
  formatYMD,
  validateDateFormat,
} = require("../utils/dateUtils");
const express = require("express");
const fs = require("fs").promises; // Added for file system operations
const path = require("path"); // Added for path manipulation
const axios = require("axios"); // Added for making HTTP requests
const Handlebars = require("handlebars"); // <--- Add Handlebars

/**
 * Clone products from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneProducts = async (req, res) => {
  try {
    console.log("🔄 Starting products clone from KiotViet...");

    const result = await kiotvietService.cloneProducts();

    return successResponse(res, result, 200);
  } catch (error) {
    console.error("❌ Error cloning products:", error);
    return errorResponse(res, "Failed to clone products", error);
  }
};

/**
 * Clone customers from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneCustomers = async (req, res) => {
  try {
    console.log("🔄 Starting customers clone from KiotViet...");

    const result = await kiotvietService.cloneCustomers();

    return successResponse(res, result, 200);
  } catch (error) {
    console.error("❌ Error cloning customers:", error);
    return errorResponse(res, "Failed to clone customers", error);
  }
};

/**
 * Clone invoices for a specific month from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneInvoicesByMonth = async (req, res) => {
  try {
    const { year, month } = req.params;

    if (!year || !month) {
      return validationError(res, "Year and month parameters are required");
    }

    console.log(
      `🔄 Starting invoices clone from KiotViet for ${year}/${month}...`
    );

    const result = await kiotvietService.cloneInvoicesByMonth(year, month);

    return successResponse(res, result, 200);
  } catch (error) {
    console.error("❌ Error cloning invoices:", error);
    return errorResponse(res, "Failed to clone invoices", error);
  }
};

/**
 * Clone invoices for a specific day from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneInvoicesByDay = async (req, res) => {
  try {
    const { year, month, day } = req.params;

    if (!year || !month || !day) {
      return validationError(
        res,
        "Year, month, and day parameters are required"
      );
    }

    // Format date for logging (YYYY-MM-DD)
    const formattedDate = formatYMD({ year, month, day });
    console.log(
      `🔄 Starting invoices clone from KiotViet for ${formattedDate}...`
    );

    const result = await kiotvietService.cloneInvoicesByDay(year, month, day);

    return successResponse(res, result, 200);
  } catch (error) {
    console.error("❌ Error cloning invoices by day:", error);
    return errorResponse(res, "Failed to clone invoices", error);
  }
};

/**
 * Clone invoices for today from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneInvoicesToday = async (req, res) => {
  try {
    // Get today's date
    const { year, month, day } = getTodayComponents();
    const formattedDate = formatYMD({ year, month, day });

    console.log(
      `🔄 Starting invoices clone from KiotViet for today (${formattedDate})...`
    );

    const result = await kiotvietService.cloneInvoicesByDay(year, month, day);

    return successResponse(res, result, 200);
  } catch (error) {
    console.error("❌ Error cloning today's invoices:", error);
    return errorResponse(res, "Failed to clone today's invoices", error);
  }
};

/**
 * Sync purchase orders from KiotViet for the last 3 months
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.syncRecentPurchaseOrders = async (req, res) => {
  try {
    console.log("🔄 Starting recent purchase orders sync from KiotViet...");

    const result = await kiotvietService.cloneRecentPurchaseOrders();

    if (result.success) {
      return successResponse(res, {
        message: result.message,
        data: result.stats,
      });
    } else {
      return errorResponse(res, result.message, null, 500);
    }
  } catch (error) {
    console.error("❌ Error in syncRecentPurchaseOrders controller:", error);
    return errorResponse(
      res,
      `Failed to sync purchase orders: ${error.message}`,
      error
    );
  }
};

/**
 * Sync purchase orders from KiotViet for a specific date range
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.syncPurchaseOrdersByDateRange = async (req, res) => {
  try {
    // Get from request body
    const { fromDate, toDate } = req.body;

    if (!fromDate || !toDate) {
      return validationError(
        res,
        "Missing required parameters: fromDate and toDate in request body"
      );
    }

    // Validate date format (MM/DD/YYYY)
    const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      return validationError(
        res,
        "Invalid date format. Please use MM/DD/YYYY format."
      );
    }

    console.log(
      `🔄 Starting purchase orders sync from ${fromDate} to ${toDate}...`
    );

    const result = await kiotvietService.clonePurchaseOrders(fromDate, toDate);

    if (result.success) {
      return successResponse(res, {
        message: result.message,
        data: result.stats,
      });
    } else {
      return errorResponse(res, result.message, null, 500);
    }
  } catch (error) {
    console.error(
      "❌ Error in syncPurchaseOrdersByDateRange controller:",
      error
    );
    return errorResponse(
      res,
      `Failed to sync purchase orders: ${error.message}`,
      error
    );
  }
};

/**
 * Update a product in KiotViet and related data
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing update data
 * @param {number} req.body.purchase_order_detail__id - Purchase order detail ID
 * @param {string} req.body.status - Status ('done' or 'skipped')
 * @param {Object} [req.body.update_if_done] - Data for updating product if status is 'done'
 * @param {number} [req.body.update_if_done.kiotviet_product_id] - KiotViet product ID
 * @param {number} [req.body.update_if_done.cost] - New cost value
 * @param {number} [req.body.update_if_done.basecost] - New base cost value
 * @param {string} [req.body.update_if_done.glt_note] - New note/description
 * @param {Object} res - Express response object
 */
exports.updateProduct = async (req, res) => {
  try {
    const { purchase_order_detail__id, status, update_if_done } = req.body;

    // Validate required fields
    if (!purchase_order_detail__id || !status) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: purchase_order_detail__id and status",
      });
    }

    // Validate status value
    if (!["done", "skipped"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "done" or "skipped"',
      });
    }

    // If status is 'done', validate update_if_done data
    if (status === "done") {
      if (!update_if_done) {
        return res.status(400).json({
          success: false,
          message: 'update_if_done data is required when status is "done"',
        });
      }

      const { kiotviet_product_id, cost, basecost } = update_if_done;
      if (!kiotviet_product_id || !cost || !basecost) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields in update_if_done: kiotviet_product_id, cost, and basecost",
        });
      }
    }

    // Call service to handle the update
    await kiotvietService.updateProductWithStatus(
      purchase_order_detail__id,
      status,
      update_if_done
    );

    return res.json({
      success: true,
      message: `Product ${
        status === "done" ? "updated" : "skipped"
      } successfully`,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating product",
    });
  }
};

// New controller function for printing price board
exports.getPrintPriceBoard = async (req, res) => {
  try {
    const { product_id, kiotviet_product_id } = req.query;

    if (!product_id && !kiotviet_product_id) {
      return badRequest(
        res,
        "Missing product_id or kiotviet_product_id query parameter."
      );
    }

    // Ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are loaded (consider moving client init outside if used often)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error(
        "Supabase URL or Service Key is not set in environment variables."
      );
      return serverError(
        res,
        "Server configuration error: Supabase credentials missing."
      );
    }

    // Create Supabase client locally for this function, or ensure it's passed/available
    // For consistency with printController, it might be better to use a shared Supabase client
    // const { createClient } = require('@supabase/supabase-js'); // If creating new client
    // const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let filterField = "";
    let filterValue = "";

    if (product_id) {
      filterField = "id";
      filterValue = parseInt(product_id);
      if (isNaN(filterValue)) {
        return badRequest(res, "Invalid product_id format.");
      }
    } else if (kiotviet_product_id) {
      filterField = "kiotviet_id";
      filterValue = parseInt(kiotviet_product_id);
      if (isNaN(filterValue)) {
        return badRequest(res, "Invalid kiotviet_product_id format.");
      }
    }

    const selectQuery = "select=full_name,description,base_price";
    // Using direct axios call as before, but could use Supabase client as well
    const productApiUrl = `${SUPABASE_URL}/rest/v1/kv_products?${selectQuery}&${filterField}=eq.${filterValue}`;

    console.log(
      "🔍 Fetching product data from Supabase for price board:",
      productApiUrl
    );

    let productData;
    try {
      const response = await axios.get(productApiUrl, {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      });

      if (response.data && response.data.length > 0) {
        productData = response.data[0];
        console.log("✅ Product data found for price board:", productData);
      } else {
        console.log(
          "❌ No product found for price board (filter:",
          filterField,
          "=",
          filterValue,
          ")"
        );
        return notFound(res, "Product not found in Supabase for price board.");
      }
    } catch (apiError) {
      console.error(
        `Error fetching product for price board from Supabase (filter: ${filterField}=${filterValue}):`,
        apiError.response ? apiError.response.data : apiError.message
      );
      return serverError(
        res,
        "Failed to fetch product data from Supabase for price board.",
        apiError.message
      );
    }

    const templatePath = path.join(
      __dirname,
      "../views/templates/price-board.html"
    );

    // Use description for title, fallback to full_name if description is empty
    const productTitle =
      productData.description || productData.full_name || "N/A";
    // Pass raw base_price to template, let Handlebars helper format it
    const price =
      productData.base_price !== null && productData.base_price !== undefined
        ? parseFloat(productData.base_price)
        : 0;

    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Month is 0-indexed
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const currentDateString = `${day}/${month}/${year} - ${hours}:${minutes}`;

    // Read, compile, and render Handlebars template
    const templateFileContent = await fs.readFile(templatePath, "utf-8");
    const compiledTemplate = Handlebars.compile(templateFileContent);
    const htmlContent = compiledTemplate({
      productTitle,
      price, // Pass raw price
      currentDateString,
    });

    console.log("📄 Generated price board HTML with Handlebars:", {
      productTitle,
      price,
      currentDateString,
    });

    res.setHeader("Content-Type", "text/html");
    res.send(htmlContent);
  } catch (error) {
    console.error("Error generating price board:", error);
    // Simplified error handling, adjust as needed
    if (error.isAxiosError) {
      serverError(
        res,
        "API error while generating price board.",
        error.response?.data || error.message
      );
    } else {
      serverError(res, "Error generating price board.", error.message);
    }
  }
};

module.exports = {
  cloneProducts: exports.cloneProducts,
  cloneCustomers: exports.cloneCustomers,
  cloneInvoicesByMonth: exports.cloneInvoicesByMonth,
  cloneInvoicesByDay: exports.cloneInvoicesByDay,
  cloneInvoicesToday: exports.cloneInvoicesToday,
  syncRecentPurchaseOrders: exports.syncRecentPurchaseOrders,
  syncPurchaseOrdersByDateRange: exports.syncPurchaseOrdersByDateRange,
  updateProduct: exports.updateProduct,
  getPrintPriceBoard: exports.getPrintPriceBoard,
};
