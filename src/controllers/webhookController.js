/**
 * Handle product update webhook from KiotViet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleProductUpdate = async (req, res) => {
    try {
        // Log webhook metadata
        console.log('📥 Received KiotViet webhook:', {
            event: req.webhookEvent,
            delivery: req.webhookDelivery,
            headers: {
                'x-hub-signature': req.headers['x-hub-signature'],
                'x-webhook-event': req.headers['x-webhook-event'],
                'x-webhook-delivery': req.headers['x-webhook-delivery']
            }
        });

        // Log the webhook data
        const webhookData = req.body;
        console.log('Webhook data:', JSON.stringify(webhookData, null, 2));

        // Extract product data
        if (webhookData.Notifications && webhookData.Notifications.length > 0) {
            const notification = webhookData.Notifications[0];
            if (notification.Data && notification.Data.length > 0) {
                const productData = notification.Data[0];
                console.log('Product data:', {
                    id: productData.Id,
                    code: productData.Code,
                    name: productData.Name,
                    basePrice: productData.BasePrice,
                    cost: productData.Inventories?.[0]?.Cost,
                    description: productData.Description
                });
            }
        }

        // For now, just acknowledge receipt
        return res.status(200).json({
            success: true,
            message: 'Webhook received successfully',
            webhookId: webhookData.Id,
            attempt: webhookData.Attempt
        });
    } catch (error) {
        console.error('❌ Error handling product update webhook:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Error processing webhook'
        });
    }
}; 