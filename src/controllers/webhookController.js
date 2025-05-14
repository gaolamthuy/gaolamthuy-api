/**
 * Handle product update webhook from KiotViet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleProductUpdate = async (req, res) => {
    try {
        // Log the received webhook data
        console.log('📥 Received KiotViet product update webhook:', JSON.stringify(req.body, null, 2));

        // For now, just acknowledge receipt
        return res.status(200).json({
            success: true,
            message: 'Webhook received successfully'
        });
    } catch (error) {
        console.error('❌ Error handling product update webhook:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Error processing webhook'
        });
    }
}; 