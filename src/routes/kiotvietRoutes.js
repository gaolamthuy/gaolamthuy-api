/**
 * KiotViet API Routes
 * Routes for accessing and synchronizing KiotViet data
 */

const express = require("express");
const router = express.Router();
const { basicAuth } = require("../middlewares/auth");
const { isValidYear, isValidMonth, isValidDay } = require("../utils/dateUtils");
const { validationError } = require("../utils/responseHandler");
const {
  cloneProducts,
  clonePricebooks,
  updateProductWithStatus,
} = require("../services/kiotvietService");

// Import controllers
const kiotvietController = require("../controllers/kiotvietController");

// Apply authentication middleware to all routes
router.use(basicAuth);

/**
 * Product endpoints
 */
router.post("/clone/products", async (req, res) => {
  try {
    const result = await cloneProducts();
    res.json(result);
  } catch (error) {
    console.error("Error cloning products:", error);
    res.status(500).json({
      success: false,
      message: "Error cloning products",
      error: error.message,
    });
  }
});

/**
 * @route POST /kiotviet/update/product
 * @description Update product status and details in KiotViet
 */
router.post("/product/update", basicAuth, async (req, res) => {
  try {
    // Lấy các trường từ request body
    const {
      purchase_order_detail_id,
      status,
      kiotviet_product_id,
      cost,
      baseprice,
      description,
    } = req.body;

    // Validate các trường bắt buộc
    if (
      !purchase_order_detail_id ||
      !status ||
      !kiotviet_product_id ||
      cost === undefined || // Có thể = 0
      baseprice === undefined // Có thể = 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Thiếu trường bắt buộc (purchase_order_detail_id, status, kiotviet_product_id, cost, baseprice)",
      });
    }

    if (status !== "done") {
      return res.status(400).json({
        success: false,
        message: 'status chỉ chấp nhận giá trị "done"',
      });
    }

    // Gọi service update (chỉ truyền description nếu có)
    await updateProductWithStatus(purchase_order_detail_id, status, {
      kiotviet_product_id,
      cost,
      baseprice,
      description:
        description && description.trim() !== "" ? description : null,
    });

    res.json({
      success: true,
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({
      success: false,
      message: "Error updating product",
      error: error.message,
    });
  }
});

/**
 * @route POST /kiotviet/clone/pricebooks
 * @description Clone pricebooks from KiotViet API
 */
router.post("/clone/pricebooks", async (req, res) => {
  try {
    const result = await clonePricebooks();
    res.json(result);
  } catch (error) {
    console.error("Error cloning pricebooks:", error);
    res.status(500).json({
      success: false,
      message: "Error cloning pricebooks",
      error: error.message,
    });
  }
});

/**
 * Customer endpoints
 */
router.post("/clone/customers", kiotvietController.cloneCustomers);

/**
 * Purchase Order sync endpoints (moved from syncRoutes.js)
 */
router.post(
  "/clone/purchase-orders",
  kiotvietController.syncRecentPurchaseOrders
);
router.post(
  "/clone/purchase-orders/date-range",
  kiotvietController.syncPurchaseOrdersByDateRange
);

/**
 * Invoice cloning endpoints with different time parameters
 * - Monthly: /clone/invoices/{year}/{month}
 * - Daily: /clone/invoices/{year}/{month}/{day}
 * - Today: /clone/invoices/today
 */
// Clone invoices by month (when day is not specified)
router.post("/clone/invoices/:year/:month", (req, res) => {
  const { year, month } = req.params;

  // Validate year and month
  if (!isValidYear(year) || !isValidMonth(month)) {
    return validationError(
      res,
      "Invalid year or month. Year should be a 4-digit number, month should be 1-12."
    );
  }

  // Call the controller with year and month
  kiotvietController.cloneInvoicesByMonth(req, res);
});

// Clone invoices by specific day
router.post("/clone/invoices/:year/:month/:day", (req, res) => {
  const { year, month, day } = req.params;

  // Validate year, month, and day
  if (
    !isValidYear(year) ||
    !isValidMonth(month) ||
    !isValidDay(day, month, year)
  ) {
    return validationError(
      res,
      "Invalid date. Please provide valid year, month, and day values."
    );
  }

  // Call the controller with year, month, and day
  kiotvietController.cloneInvoicesByDay(req, res);
});

// Clone today's invoices
router.post("/clone/invoices/today", kiotvietController.cloneInvoicesToday);

/**
 * Add any other KiotViet routes here as needed
 */

module.exports = router;
