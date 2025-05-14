const crypto = require('crypto');

/**
 * Verify KiotViet webhook signature
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const verifyWebhookSignature = (req, res, next) => {
    try {
        console.log('🔐 Starting webhook signature verification');
        /*
        console.log('📍 Current middleware state:', {
            hasRawBody: !!req.rawBody,
            rawBodyLength: req.rawBody?.length,
            hasBody: !!req.body,
            bodyType: typeof req.body,
            path: req.path,
            method: req.method
        });
        */
        
        // Log all relevant headers
        console.log('📨 Webhook Headers:', {
            signature: req.headers['x-hub-signature'],
            event: req.headers['x-webhook-event'],
            delivery: req.headers['x-webhook-delivery'],
            // contentType: req.headers['content-type'] // Can be verbose
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

        // The signature might be SHA256 even if labeled as SHA1
        const [declaredAlgorithm, hash] = signature.split('=');
        // console.log('🔑 Signature parts:', { declaredAlgorithm, hash }); // Can be verbose

        if (!hash) {
            console.warn('❌ Invalid signature format');
            return res.status(401).json({
                success: false,
                message: 'Invalid signature format'
            });
        }

        // Get the raw body and secret
        if (!req.rawBody) {
            console.error('❌ No raw body found in request');
            return res.status(500).json({
                success: false,
                message: 'Internal server error - no raw body'
            });
        }

        const rawBody = req.rawBody;
        const secret = process.env.KIOTVIET_WEBHOOK_SECRET || 'webhook_mySecretKey_2025';

        // Try both SHA1 and SHA256 since KiotViet might be mislabeling
        const algorithms = ['sha1', 'sha256'];
        const results = {};

        for (const algorithm of algorithms) {
            const calculatedHash = crypto
                .createHmac(algorithm, secret)
                .update(rawBody)
                .digest('hex');
            results[algorithm] = calculatedHash;
        }

        console.log('🔐 Verification attempts:', {
            receivedHash: hash,
            // sha1Result: results.sha1, // Keep for debugging if necessary, but can be verbose
            // sha256Result: results.sha256,
            sha1Match: hash === results.sha1,
            sha256Match: hash === results.sha256,
            hashLength: hash.length,
            // bodyPreview: rawBody.substring(0, 100) + '...' // Can be verbose
        });

        // Check if either hash matches
        if (hash === results.sha1 || hash === results.sha256) {
            const matchedAlgorithm = hash === results.sha1 ? 'SHA1' : 'SHA256';
            console.log(`✅ Signature verified successfully using ${matchedAlgorithm}`);
            // Add webhook event info to request for later use
            req.webhookEvent = req.headers['x-webhook-event'];
            req.webhookDelivery = req.headers['x-webhook-delivery'];
            next();
        } else {
            console.warn('❌ Invalid signature - no matching hash found');
            console.log('Raw body used for calculation:', rawBody);
            console.log('Received hash:', hash);
            console.log('SHA1 calculated:', results.sha1);
            console.log('SHA256 calculated:', results.sha256);
            return res.status(200).json({  // Changed to 200 to acknowledge receipt
                success: false,
                message: 'Invalid signature, but acknowledging receipt',
                error: 'Signature verification failed'
            });
        }

    } catch (error) {
        console.error('❌ Error verifying webhook signature:', error);
        console.error(error.stack);
        return res.status(200).json({  // Changed to 200 to acknowledge receipt
            success: false,
            message: 'Error verifying signature, but acknowledging receipt',
            error: error.message || 'Unknown error'
        });
    }
};

module.exports = {
    verifyWebhookSignature
}; 