/**
 * KiotViet Controller
 * Handles KiotViet data cloning operations
 */

const kiotvietService = require('../services/kiotvietService');

/**
 * Clone products from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneProducts = async (req, res) => {
  try {
    console.log('🔄 Starting products clone from KiotViet...');
    
    const result = await kiotvietService.cloneProducts();
    
    return res.status(200).json({
      success: true,
      message: 'Products cloned successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error cloning products:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clone products',
      error: error.message
    });
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
    
    return res.status(200).json({
      success: true,
      message: 'Customers cloned successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error cloning customers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clone customers',
      error: error.message
    });
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
      return res.status(400).json({
        success: false,
        message: 'Year and month parameters are required'
      });
    }
    
    console.log(`🔄 Starting invoices clone from KiotViet for ${year}/${month}...`);
    
    const result = await kiotvietService.cloneInvoicesByMonth(year, month);
    
    return res.status(200).json({
      success: true,
      message: `Invoices for ${year}/${month} cloned successfully`,
      data: result
    });
  } catch (error) {
    console.error('❌ Error cloning invoices:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clone invoices',
      error: error.message
    });
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
      return res.status(400).json({
        success: false,
        message: 'Year, month, and day parameters are required'
      });
    }
    
    // Format date for logging (YYYY-MM-DD)
    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    console.log(`🔄 Starting invoices clone from KiotViet for ${formattedDate}...`);
    
    const result = await kiotvietService.cloneInvoicesByDay(year, month, day);
    
    return res.status(200).json({
      success: true,
      message: `Invoices for ${formattedDate} cloned successfully`,
      data: result
    });
  } catch (error) {
    console.error('❌ Error cloning invoices by day:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clone invoices',
      error: error.message
    });
  }
};

/**
 * Clone invoices for today from KiotViet API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.cloneInvoicesToday = async (req, res) => {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const year = today.getFullYear().toString();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    
    console.log(`🔄 Starting invoices clone from KiotViet for today (${year}-${month}-${day})...`);
    
    const result = await kiotvietService.cloneInvoicesByDay(year, month, day);
    
    return res.status(200).json({
      success: true,
      message: 'Today\'s invoices cloned successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error cloning today\'s invoices:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clone today\'s invoices',
      error: error.message
    });
  }
}; 