/**
 * KiotViet Controller
 * Handles KiotViet data cloning operations
 */

const kiotvietService = require('../services/kiotvietService');
const { successResponse, errorResponse, validationError } = require('../utils/responseHandler');
const { getTodayComponents, formatYMD, validateDateFormat } = require('../utils/dateUtils');

/**
 * Clone products from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneProducts = async (req, res) => {
  try {
    console.log('🔄 Starting products clone from KiotViet...');
    
    const result = await kiotvietService.cloneProducts();
    
    return successResponse(res, result, 200);
  } catch (error) {
    console.error('❌ Error cloning products:', error);
    return errorResponse(res, 'Failed to clone products', error);
  }
};

/**
 * Clone customers from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneCustomers = async (req, res) => {
  try {
    console.log('🔄 Starting customers clone from KiotViet...');
    
    const result = await kiotvietService.cloneCustomers();
    
    return successResponse(res, result, 200);
  } catch (error) {
    console.error('❌ Error cloning customers:', error);
    return errorResponse(res, 'Failed to clone customers', error);
  }
};

/**
 * Clone invoices for a specific month from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneInvoicesByMonth = async (req, res) => {
  try {
    const { year, month } = req.params;
    
    if (!year || !month) {
      return validationError(res, 'Year and month parameters are required');
    }
    
    console.log(`🔄 Starting invoices clone from KiotViet for ${year}/${month}...`);
    
    const result = await kiotvietService.cloneInvoicesByMonth(year, month);
    
    return successResponse(res, result, 200);
  } catch (error) {
    console.error('❌ Error cloning invoices:', error);
    return errorResponse(res, 'Failed to clone invoices', error);
  }
};

/**
 * Clone invoices for a specific day from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneInvoicesByDay = async (req, res) => {
  try {
    const { year, month, day } = req.params;
    
    if (!year || !month || !day) {
      return validationError(res, 'Year, month, and day parameters are required');
    }
    
    // Format date for logging (YYYY-MM-DD)
    const formattedDate = formatYMD({ year, month, day });
    console.log(`🔄 Starting invoices clone from KiotViet for ${formattedDate}...`);
    
    const result = await kiotvietService.cloneInvoicesByDay(year, month, day);
    
    return successResponse(res, result, 200);
  } catch (error) {
    console.error('❌ Error cloning invoices by day:', error);
    return errorResponse(res, 'Failed to clone invoices', error);
  }
};

/**
 * Clone invoices for today from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneInvoicesToday = async (req, res) => {
  try {
    // Get today's date
    const { year, month, day } = getTodayComponents();
    const formattedDate = formatYMD({ year, month, day });
    
    console.log(`🔄 Starting invoices clone from KiotViet for today (${formattedDate})...`);
    
    const result = await kiotvietService.cloneInvoicesByDay(year, month, day);
    
    return successResponse(res, result, 200);
  } catch (error) {
    console.error('❌ Error cloning today\'s invoices:', error);
    return errorResponse(res, 'Failed to clone today\'s invoices', error);
  }
};

/**
 * Sync purchase orders from KiotViet for the last 3 months
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.syncRecentPurchaseOrders = async (req, res) => {
  try {
    console.log('🔄 Starting recent purchase orders sync from KiotViet...');
    
    const result = await kiotvietService.cloneRecentPurchaseOrders();
    
    if (result.success) {
      return successResponse(res, {
        message: result.message,
        data: result.stats
      });
    } else {
      return errorResponse(res, result.message, null, 500);
    }
  } catch (error) {
    console.error('❌ Error in syncRecentPurchaseOrders controller:', error);
    return errorResponse(res, `Failed to sync purchase orders: ${error.message}`, error);
  }
};

/**
 * Sync purchase orders from KiotViet for a specific date range
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.syncPurchaseOrdersByDateRange = async (req, res) => {
  try {
    // Get from request body
    const { fromDate, toDate } = req.body;
    
    if (!fromDate || !toDate) {
      return validationError(res, 'Missing required parameters: fromDate and toDate in request body');
    }
    
    // Validate date format (MM/DD/YYYY)
    const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      return validationError(res, 'Invalid date format. Please use MM/DD/YYYY format.');
    }
    
    console.log(`🔄 Starting purchase orders sync from ${fromDate} to ${toDate}...`);
    
    const result = await kiotvietService.clonePurchaseOrders(fromDate, toDate);
    
    if (result.success) {
      return successResponse(res, {
        message: result.message,
        data: result.stats
      });
    } else {
      return errorResponse(res, result.message, null, 500);
    }
  } catch (error) {
    console.error('❌ Error in syncPurchaseOrdersByDateRange controller:', error);
    return errorResponse(res, `Failed to sync purchase orders: ${error.message}`, error);
  }
};

/**
 * Sync data from KiotViet based on the specified type
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.syncKiotVietData = async (req, res) => {
  try {
    const { type } = req.body;
    
    if (!type) {
      return validationError(res, 'Missing required parameter: type in request body');
    }
    
    console.log(`🔄 Starting KiotViet data sync for type: ${type}...`);
    
    let result;
    
    switch (type.toLowerCase()) {
      case 'products':
        result = await kiotvietService.cloneProducts();
        break;
      case 'customers':
        result = await kiotvietService.cloneCustomers();
        break;
      case 'invoices':
        // Get today's date for syncing today's invoices
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const day = today.getDate();
        result = await kiotvietService.cloneInvoicesByDay(year, month, day);
        break;
      case 'purchase-orders':
        result = await kiotvietService.cloneRecentPurchaseOrders();
        break;
      default:
        return validationError(res, `Unknown data type: ${type}. Supported types: products, customers, invoices, purchase-orders`);
    }
    
    if (result.success) {
      return successResponse(res, {
        message: result.message,
        data: result.count || result.stats
      });
    } else {
      return errorResponse(res, result.message, null, 500);
    }
  } catch (error) {
    console.error('❌ Error in syncKiotVietData controller:', error);
    return errorResponse(res, `Failed to sync data: ${error.message}`, error);
  }
};

/**
 * Update a product in KiotViet and related data
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing update data
 * @param {number} req.body.purchase_order_detail__id - Purchase order detail ID
 * @param {string} req.body.status - Status ('done' or 'skipped')
 * @param {Object} [req.body.update_if_done] - Data for updating product if status is 'done'
 * @param {number} [req.body.update_if_done.kiotviet_product_id] - KiotViet product ID
 * @param {number} [req.body.update_if_done.cost] - New cost value
 * @param {number} [req.body.update_if_done.basecost] - New base cost value
 * @param {string} [req.body.update_if_done.glt_note] - New note/description
 * @param {Object} res - Express response object
 */
exports.updateProduct = async (req, res) => {
    try {
        const { purchase_order_detail__id, status, update_if_done } = req.body;

        // Validate required fields
        if (!purchase_order_detail__id || !status) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: purchase_order_detail__id and status'
            });
        }

        // Validate status value
        if (!['done', 'skipped'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be either "done" or "skipped"'
            });
        }

        // If status is 'done', validate update_if_done data
        if (status === 'done') {
            if (!update_if_done) {
                return res.status(400).json({
                    success: false,
                    message: 'update_if_done data is required when status is "done"'
                });
            }

            const { kiotviet_product_id, cost, basecost } = update_if_done;
            if (!kiotviet_product_id || !cost || !basecost) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields in update_if_done: kiotviet_product_id, cost, and basecost'
                });
            }
        }

        // Call service to handle the update
        await kiotvietService.updateProductWithStatus(purchase_order_detail__id, status, update_if_done);

        return res.json({
            success: true,
            message: `Product ${status === 'done' ? 'updated' : 'skipped'} successfully`
        });
    } catch (error) {
        console.error('Error updating product:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Error updating product'
        });
    }
};

module.exports = {
    cloneProducts: exports.cloneProducts,
    cloneCustomers: exports.cloneCustomers,
    cloneInvoicesByMonth: exports.cloneInvoicesByMonth,
    cloneInvoicesByDay: exports.cloneInvoicesByDay,
    cloneInvoicesToday: exports.cloneInvoicesToday,
    syncRecentPurchaseOrders: exports.syncRecentPurchaseOrders,
    syncPurchaseOrdersByDateRange: exports.syncPurchaseOrdersByDateRange,
    syncKiotVietData: exports.syncKiotVietData,
    updateProduct: exports.updateProduct
}; 