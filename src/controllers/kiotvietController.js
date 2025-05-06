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