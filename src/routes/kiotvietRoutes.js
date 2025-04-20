const express = require('express');
const router = express.Router();
const kiotvietController = require('../controllers/kiotvietController');
const authenticate = require('../middlewares/auth');
const basicAuth = require('../middlewares/basicAuth');

// Apply authentication middleware to all routes except webhook
router.use(function(req, res, next) {
  // Skip authentication for webhook route
  if (req.path === '/webhook/invoice-update') {
    return next();
  }
  // Otherwise, apply basic authentication
  basicAuth(req, res, next);
});

// KiotViet clone routes
router.post('/clone/products', kiotvietController.cloneProducts);
router.post('/clone/customers', kiotvietController.cloneCustomers);
router.post('/clone/all', kiotvietController.cloneAll);
router.post('/clone/invoices/:year', kiotvietController.cloneInvoices);
router.post('/clone/invoices/:year/:month', kiotvietController.cloneInvoicesByMonth);

// KiotViet webhook routes
router.post('/webhook/invoice-update', kiotvietController.handleInvoiceWebhook);

module.exports = router; 