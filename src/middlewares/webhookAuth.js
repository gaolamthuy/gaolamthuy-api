const crypto = require('crypto');

/**
 * Verify KiotViet webhook signature
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const verifyWebhookSignature = (req, res, next) => {
    try {
        const signature = req.headers['x-hub-signature'];
        
        // If no signature provided, return 401
        if (!signature) {
            console.warn('❌ No webhook signature provided');
            return res.status(401).json({
                success: false,
                message: 'No signature provided'
            });
        }

        // The signature from KiotViet comes in format "sha1=HASH"
        const [algorithm, hash] = signature.split('=');
        if (algorithm !== 'sha1' || !hash) {
            console.warn('❌ Invalid signature format');
            return res.status(401).json({
                success: false,
                message: 'Invalid signature format'
            });
        }

        // Get the raw body and secret
        // KiotViet expects the raw JSON string, not a stringified parsed body
        const body = JSON.stringify(req.body);
        const secret = process.env.KIOTVIET_WEBHOOK_SECRET;

        // Calculate expected signature using SHA1
        const expectedHash = crypto
            .createHmac('sha1', secret)
            .update(body)
            .digest('hex');

        // Compare signatures
        if (hash !== expectedHash) {
            console.warn('❌ Invalid webhook signature');
            console.log('Received hash:', hash);
            console.log('Expected hash:', expectedHash);
            console.log('Body used for hash:', body);
            return res.status(401).json({
                success: false,
                message: 'Invalid signature'
            });
        }

        // Add webhook event info to request for later use
        req.webhookEvent = req.headers['x-webhook-event'];
        req.webhookDelivery = req.headers['x-webhook-delivery'];

        next();
    } catch (error) {
        console.error('❌ Error verifying webhook signature:', error);
        return res.status(500).json({
            success: false,
            message: 'Error verifying signature'
        });
    }
};

module.exports = {
    verifyWebhookSignature
}; 