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

        // Get the raw body and secret
        const body = JSON.stringify(req.body);
        const secret = process.env.KIOTVIET_WEBHOOK_SECRET;

        // Calculate expected signature
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(body)
            .digest('hex');

        // Compare signatures
        if (signature !== expectedSignature) {
            console.warn('❌ Invalid webhook signature');
            return res.status(401).json({
                success: false,
                message: 'Invalid signature'
            });
        }

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