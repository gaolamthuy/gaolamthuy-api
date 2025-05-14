/**
 * Webhook Routes
 * Routes for handling webhooks from external services
 */

const express = require('express');
const router = express.Router();
const { verifyWebhookSignature } = require('../middlewares/webhookAuth');
const webhookController = require('../controllers/webhookController');

// Debug middleware to log route matching
/*
const debugRoute = (req, res, next) => {
    console.log('🛣️ Route matched:', {
        originalUrl: req.originalUrl,
        path: req.path,
        method: req.method
    });
    next();
};
*/

/**
 * KiotViet webhook endpoints
 */
router.post('/kiotviet/webhook/product-update', 
    // debugRoute, // Commented out
    (req, res, next) => {
        // console.log('🔄 Processing webhook in route handler'); // Commented out
        // Parse raw body into JSON if not already parsed
        if (req.rawBody && !req.body) {
            try {
                req.body = JSON.parse(req.rawBody);
                console.log('✅ Successfully parsed webhook body');
            } catch (error) {
                console.error('❌ Error parsing webhook body:', error);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid JSON payload'
                });
            }
        } else {
            console.log('⚠️ Request body state:', {
                hasRawBody: !!req.rawBody,
                hasBody: !!req.body,
                rawBodyLength: req.rawBody?.length,
                bodyType: typeof req.body
            });
        }
        next();
    },
    verifyWebhookSignature,  // Verify KiotViet signature
    webhookController.handleProductUpdate
);

// Debug endpoint to test webhook route
router.get('/kiotviet/webhook/test', (req, res) => {
    res.json({
        message: 'Webhook endpoint is accessible',
        timestamp: new Date().toISOString()
    });
});

module.exports = router; 