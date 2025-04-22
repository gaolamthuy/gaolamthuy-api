/**
 * KiotViet API Routes
 * Routes for accessing and synchronizing KiotViet data
 */

const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middlewares/auth');

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
 * Invoice cloning endpoints with different time parameters
 * - Monthly: /clone/invoices/{year}/{month}
 * - Daily: /clone/invoices/{year}/{month}/{day}
 * - Today: /clone/invoices/today
 */
// Clone invoices by month (when day is not specified)
router.post('/clone/invoices/:year/:month', (req, res, next) => {
  const { year, month } = req.params;
  
  // Validate year and month
  if (!isValidYear(year) || !isValidMonth(month)) {
    return res.status(400).json({
      success: false,
      message: "Invalid year or month. Year should be a 4-digit number, month should be 1-12."
    });
  }
  
  // Call the controller with year and month
  kiotvietController.cloneInvoicesByMonth(req, res, next);
});

// Clone invoices by specific day
router.post('/clone/invoices/:year/:month/:day', (req, res, next) => {
  const { year, month, day } = req.params;
  
  // Validate year, month, and day
  if (!isValidYear(year) || !isValidMonth(month) || !isValidDay(day, month, year)) {
    return res.status(400).json({
      success: false,
      message: "Invalid date. Please provide valid year, month, and day values."
    });
  }
  
  // Call the controller with year, month, and day
  kiotvietController.cloneInvoicesByDay(req, res, next);
});

// Clone today's invoices
router.post('/clone/invoices/today', kiotvietController.cloneInvoicesToday);

/**
 * Utility functions for date validation
 */
function isValidYear(year) {
  const yearNum = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  return !isNaN(yearNum) && year.length === 4 && yearNum >= 2020 && yearNum <= currentYear;
}

function isValidMonth(month) {
  const monthNum = parseInt(month, 10);
  return !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12;
}

function isValidDay(day, month, year) {
  const dayNum = parseInt(day, 10);
  if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
    return false;
  }
  
  // Check if the day is valid for the given month and year
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  return dayNum <= lastDayOfMonth;
}

/**
 * Add any other KiotViet routes here as needed
 */

module.exports = router; 