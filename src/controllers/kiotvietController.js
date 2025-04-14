const kiotvietService = require('../services/kiotvietService');

/**
 * Clone KiotViet products to Supabase
 */
const cloneProducts = async (req, res) => {
  try {
    const kiotvietToken = await kiotvietService.getKiotVietToken();
    const products = await kiotvietService.fetchProducts(kiotvietToken);
    const result = await kiotvietService.importProducts(products);

    res.status(200).json({ 
      success: true, 
      message: "KiotViet products clone completed",
      data: result
    });
  } catch (error) {
    console.error("❌ Error cloning KiotViet products:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Clone KiotViet customers to Supabase
 */
const cloneCustomers = async (req, res) => {
  try {
    const kiotvietToken = await kiotvietService.getKiotVietToken();
    const customers = await kiotvietService.fetchCustomers(kiotvietToken);
    const result = await kiotvietService.importCustomers(customers);

    res.status(200).json({ 
      success: true, 
      message: "KiotViet customers clone completed",
      data: result
    });
  } catch (error) {
    console.error("❌ Error cloning KiotViet customers:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Clone both KiotViet products and customers to Supabase
 */
const cloneAll = async (req, res) => {
  try {
    const kiotvietToken = await kiotvietService.getKiotVietToken();
    
    // Fetch data
    const [products, customers] = await Promise.all([
      kiotvietService.fetchProducts(kiotvietToken),
      kiotvietService.fetchCustomers(kiotvietToken)
    ]);
    
    // Import data
    const [productsResult, customersResult] = await Promise.all([
      kiotvietService.importProducts(products),
      kiotvietService.importCustomers(customers)
    ]);

    res.status(200).json({ 
      success: true, 
      message: "KiotViet complete clone (products and customers) completed",
      data: {
        ...productsResult,
        ...customersResult
      }
    });
  } catch (error) {
    console.error("❌ Error cloning KiotViet data:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Clone KiotViet invoices for a specific year to Supabase
 */
const cloneInvoices = async (req, res) => {
  try {
    const { year } = req.params;
    
    if (!year || isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year parameter. Year must be between 2000 and 2100'
      });
    }

    const results = await kiotvietService.cloneInvoicesForYear(parseInt(year));
    
    return res.status(200).json({
      success: true,
      message: `KiotViet invoices for year ${year} clone completed`,
      data: results
    });
  } catch (error) {
    console.error(`❌ Error cloning KiotViet invoices:`, error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Clone KiotViet invoices for a specific month in a year to Supabase
 */
const cloneInvoicesByMonth = async (req, res) => {
  try {
    const { year, month } = req.params;
    
    // Validate year
    if (!year || isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year parameter. Year must be between 2000 and 2100'
      });
    }
    
    // Validate month
    if (!month || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month parameter. Month must be between 1 and 12'
      });
    }

    const results = await kiotvietService.cloneInvoicesForMonth(parseInt(year), parseInt(month));
    
    const monthName = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('vi-VN', { month: 'long' });
    
    return res.status(200).json({
      success: true,
      message: `KiotViet invoices for ${monthName} ${year} clone completed`,
      data: results
    });
  } catch (error) {
    console.error(`❌ Error cloning KiotViet invoices by month:`, error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

module.exports = {
  cloneProducts,
  cloneCustomers,
  cloneAll,
  cloneInvoices,
  cloneInvoicesByMonth
}; 