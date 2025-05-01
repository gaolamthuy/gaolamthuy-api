const path = require('path');
const fs = require('fs').promises;
const db = require('../utils/database');
const { formatCurrency, formatDateTime, formatDate } = require('../utils/formatters');

/**
 * Load a template file
 * @param {string} templateName - Name of the template file
 * @returns {Promise<string>} - HTML content
 */
const loadTemplate = async (templateName) => {
  const templatePath = path.join(__dirname, `../../docs/${templateName}.html`);
  return await fs.readFile(templatePath, 'utf8');
};

/**
 * Replace template variables in HTML
 * @param {string} html - HTML template
 * @param {Object} data - Data to replace variables with
 * @returns {string} - Processed HTML
 */
const processTemplate = (html, data) => {
  let processedHtml = html;
  
  // Replace standard variables in the format {Variable_Name}
  Object.keys(data).forEach(key => {
    processedHtml = processedHtml.replace(
      new RegExp(`{${key}}`, 'g'), 
      data[key] !== undefined ? data[key] : ''
    );
  });
  
  return processedHtml;
};

/**
 * Generate invoice print HTML
 * @param {string} invoiceCode - KiotViet invoice code
 * @returns {Promise<string>} - HTML content
 */
const generateInvoicePrint = async (invoiceCode) => {
  // Fetch invoice data
  const { data: invoice, error: invoiceError } = await db.executeQuery(db => 
    db.supabase.from('kv_invoices')
      .select('*')
      .eq('code', invoiceCode)
      .single()
  );
  
  if (invoiceError || !invoice) {
    throw new Error('Invoice not found');
  }
  
  // Fetch invoice details
  const { data: invoiceDetails, error: detailsError } = await db.executeQuery(db => 
    db.supabase.from('kv_invoice_details')
      .select('*')
      .eq('invoice_id', invoice.id)
  );
  
  if (detailsError) {
    throw new Error('Error fetching invoice details');
  }
  
  // Fetch customer information if available
  let customer = null;
  if (invoice.kiotviet_customer_id) {
    const { data: customerData } = await db.executeQuery(db => 
      db.supabase.from('kv_customers')
        .select('*')
        .eq('kiotviet_id', invoice.kiotviet_customer_id)
        .single()
    );
    
    if (customerData) {
      customer = customerData;
    }
  }
  
  // Prepare template data
  const templateData = {
    Tieu_De_In: 'HÓA ĐƠN BÁN HÀNG',
    Ma_Don_Hang: invoice.code,
    Ngay_Thang_Nam: formatDateTime(invoice.purchase_date),
    Thu_Ngan: invoice.sold_by_name || 'N/A',
    Khach_Hang: invoice.customer_name || 'Khách lẻ',
    So_Dien_Thoai: customer?.contact_number || 'N/A',
    Dia_Chi_Khach_Hang: customer?.address || 'N/A',
    Phuong_Xa_Khach_Hang: customer?.ward_name || '',
    Khu_Vuc_Khach_Hang_QH_TP: `${customer?.location_name || ''}${customer?.location_name ? ' - ' : ''}${customer?.city_name || ''}`,
    Du_No_Truoc_Tao_Hoa_Don: customer?.debt ? formatCurrency(customer.debt) : '0',
    Ghi_Chu: invoice.description || '',
    Tong_Tien_Hang: formatCurrency(invoice.total - invoice.discount),
    Tong_Don_Hang: formatCurrency(invoice.total),
    Chiet_Khau_Hoa_Don: formatCurrency(invoice.discount)
  };
  
  // Format invoice details
  let formattedDetails = '';
  for (const detail of invoiceDetails) {
    formattedDetails += `
      <tr>
          <td colspan="3">${detail.product_name} - (${detail.note || ''})</td>
      </tr>
      <tr>
          <td style="border-bottom:1px dashed black">${detail.quantity} ${detail.unit || 'Cái'}</td>
          <td style="border-bottom:1px dashed black; text-align:right">${formatCurrency(detail.price - detail.discount)}</td>
          <td style="border-bottom:1px dashed black; text-align:right">${formatCurrency(detail.sub_total)}</td>
      </tr>
    `;
  }
  
  // Load and process template
  let html = await loadTemplate('printInvoice');
  html = processTemplate(html, templateData);
  
  // Replace details section
  html = html.replace(/\{Ten_Hang_Hoa\} - \(\{Ghi_Chu_Hang_Hoa\}\).*?\{Thanh_Tien\}\<\/td\>/s, formattedDetails);
  
  // Payment status
  const paymentStatus = Math.abs(invoice.total - invoice.discount - invoice.total_payment) < 1 
    ? `<div style="clear: both; text-align: center; margin: 10px 0; padding: 5px; border: 2px dashed #28a745;">
         <span style="color: #28a745; font-weight: bold;">✅ ĐÃ THANH TOÁN ĐỦ</span>
       </div>`
    : "";
  
  html = html.replace(/\$\{[^}]+\}/g, paymentStatus);
  
  return html;
};

/**
 * Generate product label print HTML
 * @param {string} productId - KiotViet product ID
 * @param {number} quantity - Quantity
 * @returns {Promise<string>} - HTML content
 */
const generateProductLabelPrint = async (productId, quantity = 1) => {
  // Fetch product data
  const { data: product, error: productError } = await db.executeQuery(db => 
    db.supabase.from('kv_products')
      .select('*')
      .eq('kiotviet_id', productId)
      .single()
  );
  
  if (productError || !product) {
    throw new Error('Product not found');
  }
  
  const productQty = parseFloat(quantity) || 1;
  const pricePerUnit = product.base_price || 0;
  const totalPrice = pricePerUnit * productQty;
  
  // Prepare data for template
  const templateData = {
    productName: product.full_name || product.name,
    order_template: product.order_template || '',
    price: pricePerUnit,
    quantity: productQty,
    totalPrice: totalPrice,
    packingDate: formatDate(new Date()),
    storeInfo: 'Gạo Lâm Thúy <br> 23 Ng.Đ.Chiểu, P4, Q.PN, TP.HCM'
  };
  
  // Load template
  let html = await loadTemplate('printLabel');
  
  // Replace formatCurrency function
  html = html.replace(/formatCurrency\([^)]+\)/g, (match) => {
    const value = match.match(/formatCurrency\(([^)]+)\)/)[1];
    if (value === 'data.price') return formatCurrency(templateData.price);
    if (value === 'data.totalPrice') return formatCurrency(templateData.totalPrice);
    return match;
  });
  
  // Replace template variables
  Object.keys(templateData).forEach(key => {
    const regex = new RegExp(`\\$\\{data.${key}\\}`, 'g');
    html = html.replace(regex, templateData[key]);
  });
  
  return html;
};

/**
 * Create a print job
 * @param {number|string} invoiceId - KiotViet invoice ID
 * @param {string} docType - Document type
 * @returns {Promise<Object>} - Created job
 */
const createPrintJob = async (invoiceId, docType) => {
  // Validate doc_type
  const validDocTypes = ['invoice-a5', 'invoice-80', 'label'];
  if (!validDocTypes.includes(docType)) {
    throw new Error('Invalid document type');
  }
  
  // Create print job
  const { data: job, error } = await db.insertRecord('glt_print_jobs', {
    kiotviet_invoice_id: invoiceId,
    doc_type: docType,
    status: 'pending'
  });
  
  if (error) {
    throw new Error(`Failed to create print job: ${error.message}`);
  }
  
  return job;
};

/**
 * Get pending print jobs
 * @returns {Promise<Array>} - List of pending jobs
 */
const getPendingPrintJobs = async () => {
  const { data: jobs, error } = await db.executeQuery(db => 
    db.supabase.from('glt_print_jobs')
      .select('*, kv_invoices(code)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
  );
  
  if (error) {
    throw new Error(`Failed to fetch print jobs: ${error.message}`);
  }
  
  return jobs;
};

/**
 * Update print job status
 * @param {number} jobId - Job ID
 * @param {string} docType - Document type (optional)
 * @returns {Promise<Object>} - Updated job
 */
const updatePrintJobStatus = async (jobId, docType) => {
  // Validate docType if provided
  if (docType) {
    const validDocTypes = ['invoice-a5', 'invoice-80', 'label'];
    if (!validDocTypes.includes(docType)) {
      throw new Error('Invalid document type');
    }
  }
  
  // Update job
  const updateData = {
    status: 'done',
    ...(docType && { doc_type: docType })
  };
  
  const { data: job, error } = await db.updateRecord('glt_print_jobs', 'id', jobId, updateData);
  
  if (error) {
    throw new Error(`Failed to update print job: ${error.message}`);
  }
  
  return job;
};

module.exports = {
  generateInvoicePrint,
  generateProductLabelPrint,
  createPrintJob,
  getPendingPrintJobs,
  updatePrintJobStatus
}; 