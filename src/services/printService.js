const path = require('path');
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');
const { formatCurrency, formatDateTime, formatDate } = require('../utils/formatters');

// Initialize Supabase client directly
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Load a template file
 * @param {string} templateName - Name of the template file
 * @returns {Promise<string>} - HTML content
 */
const loadTemplate = async (templateName) => {
  const templatePath = path.join(__dirname, `../../src/views/templates/${templateName}.html`);
  console.log(`Loading template from: ${templatePath}`);
  try {
    return await fs.readFile(templatePath, 'utf8');
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error);
    throw new Error(`Template not found: ${error.message}`);
  }
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
  console.log(`Generating invoice HTML for code: ${invoiceCode}`);
  
  try {
    // Fetch invoice data
    console.log('Fetching invoice data...');
    const { data: invoice, error: invoiceError } = await supabase
      .from('kv_invoices')
      .select('*')
      .eq('code', invoiceCode)
      .single();
    
    if (invoiceError) {
      console.error('Error fetching invoice:', invoiceError);
      throw new Error(`Failed to fetch invoice: ${invoiceError.message}`);
    }
    
    if (!invoice) {
      console.error('Invoice not found for code:', invoiceCode);
      throw new Error('Invoice not found');
    }
    
    console.log('Invoice found:', invoice.id);
    
    // Fetch invoice details
    const { data: invoiceDetails, error: detailsError } = await supabase
      .from('kv_invoice_details')
      .select('*')
      .eq('invoice_id', invoice.id);
    
    if (detailsError) {
      console.error('Error fetching invoice details:', detailsError);
      throw new Error('Error fetching invoice details');
    }
    
    console.log(`Found ${invoiceDetails?.length || 0} invoice details`);
    
    // Fetch customer information if available
    let customer = null;
    if (invoice.kiotviet_customer_id) {
      const { data: customerData } = await supabase
        .from('kv_customers')
        .select('*')
        .eq('kiotviet_id', invoice.kiotviet_customer_id)
        .single();
      
      if (customerData) {
        customer = customerData;
        console.log('Customer found:', customer.id);
      }
    }
    
    // Load template
    const html = await loadTemplate('invoice');
    console.log('Template loaded successfully');
    
    // Prepare template data
    const templateData = {
      Tieu_De_In: 'HÓA ĐƠN BÁN HÀNG',
      Ma_Don_Hang: invoice.code,
      Ngay_Thang_Nam: formatDateTime(invoice.purchase_date) || 'N/A',
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
    
    // Process template
    let processedHtml = processTemplate(html, templateData);
    
    // Replace details section
    processedHtml = processedHtml.replace(/\{Ten_Hang_Hoa\} - \(\{Ghi_Chu_Hang_Hoa\}\).*?\{Thanh_Tien\}\<\/td\>/s, formattedDetails);
    
    // Payment status
    const paymentStatus = Math.abs(invoice.total - invoice.discount - invoice.total_payment) < 1 
      ? `<div style="clear: both; text-align: center; margin: 10px 0; padding: 5px; border: 2px dashed #28a745;">
           <span style="color: #28a745; font-weight: bold;">✅ ĐÃ THANH TOÁN ĐỦ</span>
         </div>`
      : "";
    
    processedHtml = processedHtml.replace(/\$\{[^}]+\}/g, paymentStatus);
    
    return processedHtml;
  } catch (error) {
    console.error('Error in generateInvoicePrint:', error);
    throw error;
  }
};

/**
 * Generate product label print HTML
 * @param {string} productCode - Product code
 * @param {number} quantity - Quantity
 * @returns {Promise<string>} - HTML content
 */
const generateProductLabelPrint = async (productCode, quantity = 1) => {
  console.log(`Generating product label HTML for code: ${productCode}, quantity: ${quantity}`);
  
  try {
    // Fetch product data
    const { data: product, error: productError } = await supabase
      .from('kv_products')
      .select('*')
      .eq('code', productCode)
      .single();

    if (productError || !product) {
      throw new Error(`Failed to fetch product: ${productError?.message || 'Product not found'}`);
    }

    // Load raw template
    let html = await loadTemplate('label');

    const productQty = parseFloat(quantity) || 1;
    const pricePerUnit = product.base_price || 0;
    const totalPrice = pricePerUnit * productQty;

    // Format values
    const formattedPrice = formatCurrency(pricePerUnit);
    const formattedTotal = formatCurrency(totalPrice);
    const formattedDate = formatDateTime(new Date());

    // Replace formatCurrency(${data.price}) and similar
    html = html.replace(/\$\{formatCurrency\(data\.price\)\}/g, formattedPrice);
    html = html.replace(/\$\{formatCurrency\(data\.totalPrice\)\}/g, formattedTotal);

    // Replace all ${data.xxx}
    const templateData = {
      productName: product.full_name || product.name,
      order_template: product.order_template || '',
      price: formattedPrice, // already formatted
      quantity: productQty,
      totalPrice: formattedTotal, // already formatted
      packingDate: formattedDate,
      storeInfo: 'Gạo Lâm Thúy <br> 23 Ng.Đ.Chiểu, P4, Q.PN, TP.HCM'
    };

    for (const [key, value] of Object.entries(templateData)) {
      const regex = new RegExp(`\\$\\{data\\.${key}\\}`, 'g');
      html = html.replace(regex, value);
    }

    return html;
  } catch (error) {
    console.error('Error in generateProductLabelPrint:', error);
    throw error;
  }
};


/**
 * Create a print job
 * @param {string} docType - Document type
 * @param {Object} docRef - Document reference
 * @param {string} printAgentId - Print agent ID
 * @returns {Promise<Object>} - Created job
 */
const createPrintJob = async (docRef, docType, printAgentId) => {
  // Validate doc_type
  const validDocTypes = ['invoice', 'label'];
  if (!validDocTypes.includes(docType)) {
    throw new Error('Invalid document type');
  }
  
  // Create print job
  const { data: job, error } = await supabase
    .from('glt_print_jobs')
    .insert([{
      doc_type: docType,
      status: 'pending',
      print_agent_id: printAgentId,
      doc_ref: docRef
    }])
    .select()
    .single();
  
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
  const { data: jobs, error } = await supabase
    .from('glt_print_jobs')
    .select('*, kv_invoices(code)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  
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
    const validDocTypes = ['invoice-a5', 'invoice-k80', 'label'];
    if (!validDocTypes.includes(docType)) {
      throw new Error('Invalid document type');
    }
  }
  
  // Update job
  const updateData = {
    status: 'done',
    ...(docType && { doc_type: docType })
  };
  
  const { data: job, error } = await supabase
    .from('glt_print_jobs')
    .update(updateData)
    .eq('id', jobId)
    .select()
    .single();
  
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