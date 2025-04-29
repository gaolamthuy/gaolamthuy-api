const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { format } = require('date-fns');
const { vi } = require('date-fns/locale');
const { formatInTimeZone } = require('date-fns-tz');
const path = require('path');
const fs = require('fs').promises;
const printJobRoutes = require('./printJobRoutes');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Format currency function
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN').format(amount);
};

// Use print job routes
router.use('/jobs', printJobRoutes);

/**
 * GET /print/jobs
 * Get pending print jobs
 */
router.get('/jobs', async (req, res) => {
  try {
    const { data: jobs, error } = await supabase
      .from('glt_print_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching print jobs:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch print jobs',
        error: error.message
      });
    }

    return res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('Error in GET /print/jobs:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * POST /print/jobs
 * Create a new print job
 */
router.post('/jobs', async (req, res) => {
  try {
    const { kiotviet_invoice_id, doc_type } = req.body;

    // Validate required fields
    if (!kiotviet_invoice_id || !doc_type) {
      return res.status(400).json({
        success: false,
        message: 'kiotviet_invoice_id and doc_type are required'
      });
    }

    // Validate doc_type
    const validDocTypes = ['invoice', 'label'];
    if (!validDocTypes.includes(doc_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doc_type. Must be either "invoice" or "label"'
      });
    }

    // Check if invoice exists
    const { data: invoice, error: invoiceError } = await supabase
      .from('kv_invoices')
      .select('kiotviet_id')
      .eq('kiotviet_id', kiotviet_invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Create print job
    const { data: job, error } = await supabase
      .from('glt_print_jobs')
      .insert([{
        kiotviet_invoice_id,
        doc_type,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating print job:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create print job',
        error: error.message
      });
    }

    return res.status(201).json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('Error in POST /print/jobs:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * PUT /print/jobs/:id
 * Update a print job status to done
 */
router.put('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { doc_type } = req.body;

    // Validate doc_type if provided
    if (doc_type) {
      const validDocTypes = ['invoice', 'label'];
      if (!validDocTypes.includes(doc_type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid doc_type. Must be either "invoice" or "label"'
        });
      }
    }

    // Check if job exists
    const { data: existingJob, error: checkError } = await supabase
      .from('glt_print_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (checkError || !existingJob) {
      return res.status(404).json({
        success: false,
        message: 'Print job not found'
      });
    }

    // Update job
    const updateData = {
      status: 'done',
      ...(doc_type && { doc_type })
    };

    const { data: updatedJob, error } = await supabase
      .from('glt_print_jobs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating print job:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update print job',
        error: error.message
      });
    }

    return res.json({
      success: true,
      data: updatedJob
    });
  } catch (error) {
    console.error('Error in PUT /print/jobs:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET /print/kv-invoice
 * Print an invoice by code
 */
router.get('/kv-invoice', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).send('Invoice code is required');
    }
    
    // Fetch invoice data
    const { data: invoice, error: invoiceError } = await supabase
      .from('kv_invoices')
      .select('*')
      .eq('code', code)
      .single();
      
    if (invoiceError || !invoice) {
      console.error('Error fetching invoice:', invoiceError || 'Invoice not found');
      return res.status(404).send('Invoice not found');
    }
    
    // Fetch invoice details
    const { data: invoiceDetails, error: detailsError } = await supabase
      .from('kv_invoice_details')
      .select('*')
      .eq('invoice_id', invoice.id);
      
    if (detailsError) {
      console.error('Error fetching invoice details:', detailsError);
      return res.status(500).send('Error fetching invoice details');
    }
    
    // Fetch customer information if available
    let customer = null;
    if (invoice.kiotviet_customer_id) {
      const { data: customerData, error: customerError } = await supabase
        .from('kv_customers')
        .select('*')
        .eq('kiotviet_id', invoice.kiotviet_customer_id)
        .single();
        
      if (!customerError && customerData) {
        customer = customerData;
      }
    }
    
    // Prepare template data
    const templateData = {
      Tieu_De_In: 'HÓA ĐƠN BÁN HÀNG',
      Ma_Don_Hang: invoice.code,
      Ngay_Thang_Nam: formatInTimeZone(invoice.purchase_date, 'Asia/Ho_Chi_Minh', 'HH:mm:ss - dd/MM/yyyy', { locale: vi }),
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
    
    // Generate HTML from template
    const templatePath = path.join(__dirname, '../../docs/printInvoice.html');
    const htmlContent = await fs.readFile(templatePath, 'utf8');
    
    // Replace template variables
    let finalHtml = htmlContent;
    Object.keys(templateData).forEach(key => {
      finalHtml = finalHtml.replace(new RegExp(`{${key}}`, 'g'), templateData[key]);
    });
    
    // Replace details
    finalHtml = finalHtml.replace(/\{Ten_Hang_Hoa\} - \(\{Ghi_Chu_Hang_Hoa\}\).*?\{Thanh_Tien\}\<\/td\>/s, formattedDetails);
    
    // Payment status
    const paymentStatus = Math.abs(invoice.total - invoice.discount - invoice.total_payment) < 1 
      ? `<div style="clear: both; text-align: center; margin: 10px 0; padding: 5px; border: 2px dashed #28a745;">
           <span style="color: #28a745; font-weight: bold;">✅ ĐÃ THANH TOÁN ĐỦ</span>
         </div>`
      : "";
    
    finalHtml = finalHtml.replace(/\$\{[^}]+\}/g, paymentStatus);
    
    // Send HTML response
    res.setHeader('Content-Type', 'text/html');
    res.send(finalHtml);
  } catch (error) {
    console.error('Error generating invoice print:', error);
    res.status(500).send('Error generating invoice print');
  }
});

/**
 * GET /print/label-product
 * Print a product label by code
 */
router.get('/label-product', async (req, res) => {
  try {
    const { code, quantity } = req.query;
    
    if (!code) {
      return res.status(400).send('Product code is required');
    }
    
    // Fetch product data
    const { data: product, error: productError } = await supabase
      .from('kv_products')
      .select('*')
      .eq('kiotviet_id', code)
      .single();
      
    if (productError || !product) {
      console.error('Error fetching product:', productError || 'Product not found');
      return res.status(404).send('Product not found');
    }
    
    const productQty = quantity ? parseFloat(quantity) : 1;
    const pricePerUnit = product.base_price || 0;
    const totalPrice = pricePerUnit * productQty;
    
    // Prepare data for template
    const data = {
      productName: product.full_name || product.name,
      order_template: product.order_template || '',
      price: pricePerUnit,
      quantity: productQty,
      totalPrice: totalPrice,
      packingDate: format(new Date(), 'dd/MM/yyyy', { locale: vi }),
      storeInfo: 'Gạo Lâm Thúy <br> 23 Ng.Đ.Chiểu, P4, Q.PN, TP.HCM'
    };
    
    // Generate HTML from template
    const templatePath = path.join(__dirname, '../../docs/printLabel.html');
    const htmlContent = await fs.readFile(templatePath, 'utf8');
    
    // Replace formatCurrency function
    let finalHtml = htmlContent.replace(/formatCurrency\([^)]+\)/g, (match) => {
      const value = match.match(/formatCurrency\(([^)]+)\)/)[1];
      if (value === 'data.price') return formatCurrency(data.price);
      if (value === 'data.totalPrice') return formatCurrency(data.totalPrice);
      return match;
    });
    
    // Replace template variables
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`\\$\\{data.${key}\\}`, 'g');
      finalHtml = finalHtml.replace(regex, data[key]);
    });
    
    // Send HTML response
    res.setHeader('Content-Type', 'text/html');
    res.send(finalHtml);
  } catch (error) {
    console.error('Error generating product label print:', error);
    res.status(500).send('Error generating product label print');
  }
});

module.exports = router; 