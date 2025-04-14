const express = require('express');
const router = express.Router();
const kiotvietController = require('../controllers/kiotvietController');
const authenticate = require('../middlewares/auth');

// Apply authentication middleware to all routes
router.use(authenticate);

// KiotViet clone routes
router.post('/clone/products', kiotvietController.cloneProducts);
router.post('/clone/customers', kiotvietController.cloneCustomers);
router.post('/clone/all', kiotvietController.cloneAll);
router.post('/clone/invoices/:year', kiotvietController.cloneInvoices);
router.post('/clone/invoices/:year/:month', kiotvietController.cloneInvoicesByMonth);

module.exports = router; 