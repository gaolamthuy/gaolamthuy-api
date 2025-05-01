/**
 * KiotViet Controller
 * Handles KiotViet data cloning operations
 */

const kiotvietService = require('../services/kiotvietService');
const { successResponse, errorResponse, validationError } = require('../utils/responseHandler');
const { getTodayComponents, formatYMD } = require('../utils/dateUtils');

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