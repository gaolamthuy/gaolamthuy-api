const crypto = require('crypto');

/**
 * Verify KiotViet webhook signature
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const verifyWebhookSignature = (req, res, next) => {
    try {
        console.log('🔍 Starting webhook signature verification');
        
        // Log all relevant headers
        console.log('📨 Webhook Headers:', {
            signature: req.headers['x-hub-signature'],
            event: req.headers['x-webhook-event'],
            delivery: req.headers['x-webhook-delivery'],
            contentType: req.headers['content-type']
        });

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
        console.log('🔑 Signature parts:', { algorithm, hash });

        if (algorithm !== 'sha1' || !hash) {
            console.warn('❌ Invalid signature format');
            return res.status(401).json({
                success: false,
                message: 'Invalid signature format'
            });
        }

        // Get the raw body and secret
        const rawBody = JSON.stringify(req.body);
        const secret = process.env.KIOTVIET_WEBHOOK_SECRET;

        console.log('🔐 Verification details:', {
            secretLength: secret ? secret.length : 0,
            bodyLength: rawBody.length,
            bodyPreview: rawBody.substring(0, 100) + '...' // Log first 100 chars of body
        });

        // Try different methods of calculating the signature
        const methods = {
            // Method 1: Direct SHA1 HMAC
            method1: crypto.createHmac('sha1', secret).update(rawBody).digest('hex'),
            
            // Method 2: SHA1 HMAC with UTF8 encoding
            method2: crypto.createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex'),
            
            // Method 3: SHA1 HMAC with Buffer
            method3: crypto.createHmac('sha1', secret).update(Buffer.from(rawBody)).digest('hex')
        };

        console.log('🔍 Hash comparison:', {
            received: hash,
            method1: methods.method1,
            method2: methods.method2,
            method3: methods.method3
        });

        // Try all methods for matching
        const matchFound = Object.entries(methods).find(([method, calculatedHash]) => hash === calculatedHash);

        if (matchFound) {
            console.log(`✅ Signature verified using ${matchFound[0]}`);
            // Add webhook event info to request for later use
            req.webhookEvent = req.headers['x-webhook-event'];
            req.webhookDelivery = req.headers['x-webhook-delivery'];
            next();
        } else {
            console.warn('❌ No matching signature found');
            return res.status(401).json({
                success: false,
                message: 'Invalid signature'
            });
        }

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