const express = require('express');
const router = express.Router();
const { handleTransaction } = require('../controllers/paymentController');
const { basicAuth } = require('../middlewares/auth');

// Apply basic authentication to all payment routes
router.use(basicAuth);

// POST /payment - Handle incoming payment transactions
router.post('/', handleTransaction);

module.exports = router; 