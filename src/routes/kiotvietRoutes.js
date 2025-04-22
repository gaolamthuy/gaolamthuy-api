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
router.post('/clone/invoices/:year/:month', kiotvietController.cloneInvoicesByMonth);

/**
 * Add any other KiotViet routes here as needed
 */

module.exports = router; 