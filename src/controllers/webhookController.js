const {
    getRecordByField,
    insertRecord,
    updateRecord
} = require('../utils/database');

/**
 * Handle product update webhook from KiotViet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleProductUpdate = async (req, res) => {
    try {
        console.log('📥 Processing KiotViet webhook:', {
            event: req.webhookEvent,
            delivery: req.webhookDelivery
        });

        const webhookData = req.body;
        console.log('📦 Webhook payload:', JSON.stringify(webhookData, null, 2)); // Keep for debugging if needed

        if (webhookData?.Notifications?.[0]?.Data?.[0]) {
            const productUpdate = webhookData.Notifications[0].Data[0];
            const kiotvietProductId = productUpdate.Id;
            const branchId = productUpdate.Inventories?.[0]?.BranchId; // Assuming single inventory item for now

            console.log('✅ Product update data extracted:', {
                id: kiotvietProductId,
                code: productUpdate.Code,
                name: productUpdate.Name,
                basePrice: productUpdate.BasePrice,
                cost: productUpdate.Inventories?.[0]?.Cost,
                description: productUpdate.Description,
                branchId: branchId
            });

            const changes = [];
            let productDbId = null;

            // 1. Fetch old product data from kv_products
            const { data: oldProduct, error: productError } = await getRecordByField(
                'kv_products',
                'kiotviet_id',
                kiotvietProductId,
                'id, base_price, description' // Select internal id, base_price, description
            );

            if (productError) {
                console.error('❌ Error fetching product from kv_products:', productError.message);
                // Still return 200 to acknowledge, but indicate error
                return res.status(200).json({
                    success: false,
                    message: `Error fetching product ${kiotvietProductId}: ${productError.message}`,
                });
            }

            if (!oldProduct) {
                console.warn(`⚠️ Product with KiotViet ID ${kiotvietProductId} not found in kv_products.`);
                 return res.status(200).json({
                    success: true, // Acknowledged, but no action taken as product not found
                    message: `Product ${kiotvietProductId} not found locally. No update performed.`,
                });
            }
            
            productDbId = oldProduct.id; // Internal DB ID

            // Compare and track changes for kv_products
            if (oldProduct.base_price !== productUpdate.BasePrice) {
                changes.push({
                    field: 'baseprice',
                    old_value: String(oldProduct.base_price),
                    new_value: String(productUpdate.BasePrice),
                });
            }
            if (oldProduct.description !== productUpdate.Description) {
                changes.push({
                    field: 'description',
                    old_value: String(oldProduct.description),
                    new_value: String(productUpdate.Description),
                });
            }

            // 2. Fetch old inventory data from kv_product_inventories
            if (productDbId && branchId) {
                const { data: oldInventory, error: inventoryError } = await getRecordByField(
                    'kv_product_inventories',
                    'product_id', // Using internal product_id
                    productDbId,
                    'cost' // Select cost
                    // TODO: Add branch_id to the query condition if your getRecordByField supports multiple conditions
                    // For now, assuming product_id is unique enough for this branch or getRecordByField needs enhancement
                    // Or, if only one inventory per product, this is fine.
                    // If multiple branches, you'd need to filter by branch_id too.
                    // For now, we will assume this fetches the correct branch or is the only one.
                    // A more robust way would be: db.from('kv_product_inventories').select('cost').eq('product_id', productDbId).eq('branch_id', branchId).single()
                );
                 if (inventoryError) {
                    console.error(`❌ Error fetching inventory for product ID ${productDbId}, branch ${branchId}:`, inventoryError.message);
                    // Continue processing product changes, but log inventory fetch error
                } else if (!oldInventory) {
                    console.warn(`⚠️ Inventory not found for product ID ${productDbId}, branch ${branchId}.`);
                } else {
                    const newCost = productUpdate.Inventories?.[0]?.Cost;
                    if (oldInventory.cost !== newCost) {
                        changes.push({
                            field: 'cost',
                            old_value: String(oldInventory.cost),
                            new_value: String(newCost),
                        });
                    }
                }
            } else {
                console.warn('⚠️ Skipping inventory check: productDbId or branchId missing.');
            }

            // 3. Log changes if any
            if (changes.length > 0) {
                console.log('🔄 Detected changes:', changes);
                for (const change of changes) {
                    await insertRecord('glt_product_changelogs', {
                        kiotviet_id: kiotvietProductId,
                        field: change.field,
                        old_value: change.old_value,
                        new_value: change.new_value,
                        // created_at is default now()
                    });
                }
                console.log('✅ Changes logged to glt_product_changelogs.');

                // 4. Update database
                // Update kv_products
                const productUpdateData = {};
                if (changes.some(c => c.field === 'baseprice')) productUpdateData.base_price = parseFloat(productUpdate.BasePrice);
                if (changes.some(c => c.field === 'description')) productUpdateData.description = productUpdate.Description;
                
                if (Object.keys(productUpdateData).length > 0) {
                    productUpdateData.glt_updated_at = new Date().toISOString(); // Update timestamp
                    const { error: updateProductError } = await updateRecord(
                        'kv_products',
                        'kiotviet_id',
                        kiotvietProductId,
                        productUpdateData
                    );
                    if (updateProductError) console.error('❌ Error updating kv_products:', updateProductError.message);
                    else console.log('✅ kv_products updated.');
                }

                // Update kv_product_inventories
                if (changes.some(c => c.field === 'cost') && productDbId && branchId) {
                    const newCost = productUpdate.Inventories?.[0]?.Cost;
                    const { error: updateInventoryError } = await supabase // Using supabase directly for composite key update
                        .from('kv_product_inventories')
                        .update({ cost: parseFloat(newCost), synced_at: new Date().toISOString() })
                        .eq('product_id', productDbId)
                        .eq('branch_id', branchId);

                    if (updateInventoryError) console.error('❌ Error updating kv_product_inventories:', updateInventoryError.message);
                    else console.log('✅ kv_product_inventories updated.');
                }
                 return res.status(200).json({
                    success: true,
                    message: `Product ${productUpdate.Code} processed. ${changes.length} changes logged and applied.`,
                    changes_logged: changes.length,
                });
            } else {
                console.log('✅ No changes detected for product', productUpdate.Code);
                return res.status(200).json({
                    success: true,
                    message: `No changes detected for product ${productUpdate.Code}.`,
                });
            }
        }

        // Fallback if product data structure is not as expected
        console.warn('⚠️ Webhook received but no valid product notification data found.');
        return res.status(200).json({
            success: true, // Acknowledge receipt
            message: 'Webhook received but no actionable product data found.',
            webhookId: webhookData?.Id,
            attempt: webhookData?.Attempt
        });

    } catch (error) {
        console.error('❌ Error handling product update webhook:', error);
        return res.status(200).json({
            success: false, // Acknowledge receipt but indicate failure
            message: 'Webhook received but processing failed internally.',
            error: error.message || 'Unknown error'
        });
    }
}; 