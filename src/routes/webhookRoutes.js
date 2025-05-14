/**
 * Webhook Routes
 * Routes for handling webhooks from external services
 */

const express = require('express');
const router = express.Router();
const { verifyWebhookSignature } = require('../middlewares/webhookAuth');
const webhookController = require('../controllers/webhookController');

/**
 * KiotViet webhook endpoints
 */
router.post('/kiotviet/webhook/product-update', 
    verifyWebhookSignature,  // Verify KiotViet signature
    webhookController.handleProductUpdate
);

module.exports = router; 