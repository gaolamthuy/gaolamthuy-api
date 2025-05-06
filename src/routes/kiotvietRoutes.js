/**
 * KiotViet API Routes
 * Routes for accessing and synchronizing KiotViet data
 */

const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middlewares/auth');
const { isValidYear, isValidMonth, isValidDay } = require('../utils/dateUtils');
const { validationError } = require('../utils/responseHandler');

// Import controllers
const kiotvietController = require('../controllers/kiotvietController');

// Apply authentication middleware to all routes
router.use(basicAuth);

/**
 * Clone endpoints
 */
router.post('/clone/products', kiotvietController.cloneProducts);
router.post('/clone/customers', kiotvietController.cloneCustomers);

/**
 * Purchase Order sync endpoints (moved from syncRoutes.js)
 */
router.post('/clone/purchase-orders', kiotvietController.syncRecentPurchaseOrders);
router.post('/clone/purchase-orders/date-range', kiotvietController.syncPurchaseOrdersByDateRange);
router.post('/clone/kiotviet-data', kiotvietController.syncKiotVietData);

/**
 * Invoice cloning endpoints with different time parameters
 * - Monthly: /clone/invoices/{year}/{month}
 * - Daily: /clone/invoices/{year}/{month}/{day}
 * - Today: /clone/invoices/today
 */
// Clone invoices by month (when day is not specified)
router.post('/clone/invoices/:year/:month', (req, res) => {
  const { year, month } = req.params;
  
  // Validate year and month
  if (!isValidYear(year) || !isValidMonth(month)) {
    return validationError(res, "Invalid year or month. Year should be a 4-digit number, month should be 1-12.");
  }
  
  // Call the controller with year and month
  kiotvietController.cloneInvoicesByMonth(req, res);
});

// Clone invoices by specific day
router.post('/clone/invoices/:year/:month/:day', (req, res) => {
  const { year, month, day } = req.params;
  
  // Validate year, month, and day
  if (!isValidYear(year) || !isValidMonth(month) || !isValidDay(day, month, year)) {
    return validationError(res, "Invalid date. Please provide valid year, month, and day values.");
  }
  
  // Call the controller with year, month, and day
  kiotvietController.cloneInvoicesByDay(req, res);
});

// Clone today's invoices
router.post('/clone/invoices/today', kiotvietController.cloneInvoicesToday);

/**
 * Add any other KiotViet routes here as needed
 */

module.exports = router; 