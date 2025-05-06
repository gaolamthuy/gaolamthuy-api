// Debug script for print functionality
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');
const { formatCurrency, formatDateTime, formatDate } = require('./utils/formatters');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('🔍 Starting print debug script');

// Helper functions
async function loadTemplate(templateName) {
  const templatePath = path.join(__dirname, `./views/templates/${templateName}.html`);
  console.log(`Loading template from: ${templatePath}`);
  try {
    const content = await fs.readFile(templatePath, 'utf8');
    console.log(`Template loaded successfully (${content.length} characters)`);
    return content;
  } catch (error) {
    console.error(`ERROR: Failed to load template: ${error.message}`);
    console.error(`Does the path exist? Please check if '${templatePath}' is correct.`);
    throw error;
  }
}

function processTemplate(html, data) {
  let processedHtml = html;
  
  // Replace standard variables in the format {Variable_Name}
  Object.keys(data).forEach(key => {
    processedHtml = processedHtml.replace(
      new RegExp(`{${key}}`, 'g'), 
      data[key] !== undefined ? data[key] : ''
    );
  });
  
  return processedHtml;
}

async function generateInvoiceHTML(invoiceCode) {
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
      return null;
    }
    
    if (!invoice) {
      console.error('Invoice not found');
      return null;
    }
    
    console.log('Invoice found:', invoice.id);
    
    // Fetch invoice details
    const { data: invoiceDetails, error: detailsError } = await supabase
      .from('kv_invoice_details')
      .select('*')
      .eq('invoice_id', invoice.id);
    
    if (detailsError) {
      console.error('Error fetching invoice details:', detailsError);
      return null;
    }
    
    console.log(`Found ${invoiceDetails.length} invoice details`);
    
    // Load template
    const html = await loadTemplate('invoice');
    console.log('Template loaded successfully');
    
    // Create some sample data for demo
    const templateData = {
      Tieu_De_In: 'HÓA ĐƠN BÁN HÀNG',
      Ma_Don_Hang: invoice.code,
      Ngay_Thang_Nam: formatDateTime(invoice.purchase_date) || 'N/A',
      Thu_Ngan: invoice.sold_by_name || 'N/A',
      Khach_Hang: invoice.customer_name || 'Khách lẻ',
      So_Dien_Thoai: 'N/A',
      Dia_Chi_Khach_Hang: 'N/A',
      Phuong_Xa_Khach_Hang: '',
      Khu_Vuc_Khach_Hang_QH_TP: '',
      Du_No_Truoc_Tao_Hoa_Don: '0',
      Ghi_Chu: invoice.description || '',
      Tong_Tien_Hang: formatCurrency(invoice.total - invoice.discount),
      Tong_Don_Hang: formatCurrency(invoice.total),
      Chiet_Khau_Hoa_Don: formatCurrency(invoice.discount)
    };
    
    // Process template
    let processedHtml = processTemplate(html, templateData);
    
    // For simplicity, just add a placeholder for items
    const itemsHtml = '<tr><td colspan="3">Product items would go here</td></tr>';
    processedHtml = processedHtml.replace(/\{Ten_Hang_Hoa\} - \(\{Ghi_Chu_Hang_Hoa\}\).*?\{Thanh_Tien\}\<\/td\>/s, itemsHtml);
    
    return processedHtml;
  } catch (error) {
    console.error('Error generating invoice HTML:', error);
    return null;
  }
}

async function generateProductLabelHTML(productCode, quantity = 1) {
  console.log(`Generating product label HTML for code: ${productCode}, quantity: ${quantity}`);
  
  try {
    // Fetch product data
    console.log('Fetching product data...');
    const { data: product, error: productError } = await supabase
      .from('kv_products')
      .select('*')
      .eq('code', productCode)
      .single();
    
    if (productError) {
      console.error('Error fetching product:', productError);
      return null;
    }
    
    if (!product) {
      console.error('Product not found');
      return null;
    }
    
    console.log('Product found:', product.id);
    
    // Load template
    const html = await loadTemplate('label');
    console.log('Template loaded successfully');
    
    // Create sample data
    const templateData = {
      productName: product.full_name || product.name,
      order_template: product.order_template || '',
      price: product.base_price || 0,
      quantity: parseFloat(quantity) || 1,
      totalPrice: (product.base_price || 0) * (parseFloat(quantity) || 1),
      packingDate: formatDate(new Date()),
      storeInfo: 'Gạo Lâm Thúy <br> 23 Ng.Đ.Chiểu, P4, Q.PN, TP.HCM'
    };
    
    // Process template - for label we need to replace ${data.xxx} style variables
    let processedHtml = html;
    
    // Replace formatCurrency function
    processedHtml = processedHtml.replace(/formatCurrency\([^)]+\)/g, (match) => {
      const value = match.match(/formatCurrency\(([^)]+)\)/)[1];
      if (value === 'data.price') return formatCurrency(templateData.price);
      if (value === 'data.totalPrice') return formatCurrency(templateData.totalPrice);
      return match;
    });
    
    // Replace template variables
    Object.keys(templateData).forEach(key => {
      const regex = new RegExp(`\\$\\{data.${key}\\}`, 'g');
      processedHtml = processedHtml.replace(regex, templateData[key]);
    });
    
    return processedHtml;
  } catch (error) {
    console.error('Error generating product label HTML:', error);
    return null;
  }
}

// Main function
async function main() {
  try {
    // Test invoice
    const invoiceHTML = await generateInvoiceHTML('HD057559');
    if (invoiceHTML) {
      console.log('✅ Successfully generated invoice HTML');
      try {
        await fs.writeFile('debug-invoice.html', invoiceHTML, 'utf8');
        console.log('📄 Invoice HTML written to debug-invoice.html');
      } catch (err) {
        console.error('❌ Error writing invoice HTML file:', err);
      }
    } else {
      console.error('❌ Failed to generate invoice HTML');
    }
    
    // Test product label
    const labelHTML = await generateProductLabelHTML('2011102', 10);
    if (labelHTML) {
      console.log('✅ Successfully generated product label HTML');
      try {
        await fs.writeFile('debug-label.html', labelHTML, 'utf8');
        console.log('📄 Label HTML written to debug-label.html');
      } catch (err) {
        console.error('❌ Error writing label HTML file:', err);
      }
    } else {
      console.error('❌ Failed to generate product label HTML');
    }
    
    console.log('✨ Debug script completed successfully');
  } catch (error) {
    console.error('❌ Debug script failed with error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(err => console.error('❌ Fatal error in debug script:', err)); 