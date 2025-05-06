const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { format } = require('date-fns');
const { vi } = require('date-fns/locale');
const { formatInTimeZone } = require('date-fns-tz');
const path = require('path');
const fs = require('fs').promises;
const printService = require('../services/printService');
const db = require('../utils/database');
const { basicAuth } = require('../middlewares/auth');
const { htmlResponse, errorResponse, successResponse, validationError, notFoundError } = require('../utils/responseHandler');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Format currency function
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN').format(amount);
};

/**
 * GET /print/jobs
 * Get pending print jobs
 */
router.get('/jobs', basicAuth, async (req, res) => {
  try {
    const jobs = await printService.getPendingPrintJobs();
    return successResponse(res, jobs);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch print jobs', error);
  }
});

/**
 * POST /print/jobs
 * Create a new print job
 */
router.post('/jobs', basicAuth, async (req, res) => {
  try {
    const { kiotviet_invoice_id, kiotviet_invoice_code, doc_type } = req.body;

    // Validate doc_type
    if (!doc_type) {
      return validationError(res, 'doc_type is required');
    }

    const validDocTypes = ['invoice-a5', 'invoice-k80', 'label'];
    if (!validDocTypes.includes(doc_type)) {
      return validationError(res, 'Invalid doc_type. Must be either "invoice-a5" or "invoice-k80" or "label"');
    }

    // Ensure exactly one of `kiotviet_invoice_id` or `kiotviet_invoice_code` is provided
    const hasId = !!kiotviet_invoice_id;
    const hasCode = !!kiotviet_invoice_code;

    if ((hasId && hasCode) || (!hasId && !hasCode)) {
      return validationError(res, 'Provide exactly one of kiotviet_invoice_id or kiotviet_invoice_code');
    }

    // Find invoice using the provided key
    const { data: invoice, error: invoiceError } = await db.executeQuery(db =>
      db.supabase
      .from('kv_invoices')
      .select('kiotviet_id')
        .eq(hasId ? 'kiotviet_id' : 'code', hasId ? kiotviet_invoice_id : kiotviet_invoice_code)
        .single()
    );

    if (invoiceError || !invoice) {
      return notFoundError(res, 'Invoice not found');
    }

    // Create print job
    const job = await printService.createPrintJob(invoice.kiotviet_id, doc_type);
    return successResponse(res, job, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to create print job', error);
  }
});

/**
 * PUT /print/jobs/:id
 * Update a print job status to done
 */
router.put('/jobs/:id', basicAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { doc_type } = req.body;

    // Check if job exists
    const { data: existingJob, error: checkError } = await db.getRecordByField('glt_print_jobs', 'id', id);

    if (checkError || !existingJob) {
      return notFoundError(res, 'Print job not found');
    }

    // Update job
    const updatedJob = await printService.updatePrintJobStatus(id, doc_type);
    return successResponse(res, updatedJob);
  } catch (error) {
    return errorResponse(res, 'Failed to update print job', error);
  }
});

/**
 * GET /print/kv-invoice
 * Print an invoice by code
 */
router.get('/kv-invoice', async (req, res) => {
  try {
    const { code } = req.query;
    
    console.log('🔍 Print invoice request received for code:', code);
    
    if (!code) {
      return errorResponse(res, 'Invoice code is required', null, 400);
    }
    
    // Test the database connection first
    const { data: invoice } = await supabase
      .from('kv_invoices')
      .select('id, code')
      .eq('code', code)
      .single();
      
    if (!invoice) {
      console.error(`❌ Invoice ${code} not found in database`);
      return errorResponse(res, `Invoice ${code} not found in database`, null, 404);
    }
    
    console.log(`✅ Invoice found in database: ${JSON.stringify(invoice)}`);
    
    // Then attempt to generate the invoice print
    const html = await printService.generateInvoicePrint(code);
    return htmlResponse(res, html);
  } catch (error) {
    console.error('Error generating invoice print:', error);
    return errorResponse(res, 'Error generating invoice print', error);
  }
});

/**
 * GET /print/label-product
 * Print a product label by code
 */
router.get('/label-product', async (req, res) => {
  try {
    const { code, quantity } = req.query;
    
    console.log('🔍 Print label request received for code:', code, 'quantity:', quantity);
    
    if (!code) {
      return errorResponse(res, 'Product code is required', null, 400);
    }
    
    // Test the database connection first
    const { data: product } = await supabase
      .from('kv_products')
      .select('id, code, name')
      .eq('code', code)
      .single();
      
    if (!product) {
      console.error(`❌ Product ${code} not found in database`);
      return errorResponse(res, `Product ${code} not found in database`, null, 404);
    }
    
    console.log(`✅ Product found in database: ${JSON.stringify(product)}`);
    
    // Then attempt to generate the product label
    const html = await printService.generateProductLabelPrint(code, quantity);
    return htmlResponse(res, html);
  } catch (error) {
    console.error('Error generating product label print:', error);
    return errorResponse(res, 'Error generating product label print', error);
  }
});

/**
 * GET /print/debug/db
 * Test database connection
 */
router.get('/debug/db', async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test querying products
    const { data: products, error: productsError } = await supabase
      .from('kv_products')
      .select('id, name, code')
      .limit(3);
    
    // Test querying a specific invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('kv_invoices')
      .select('id, code')
      .eq('code', 'HD057559')
      .single();
    
    // Return test results
    return successResponse(res, {
      products: {
        success: !productsError,
        count: products?.length || 0,
        sample: products?.[0] || null,
        error: productsError
      },
      invoice: {
        success: !invoiceError,
        data: invoice || null,
        error: invoiceError
      }
    });
  } catch (error) {
    console.error('Error in database debug endpoint:', error);
    return errorResponse(res, 'Error testing database connection', error);
  }
});

/**
 * GET /print/debug/templates
 * Test template loading
 */
router.get('/debug/templates', async (req, res) => {
  try {
    console.log('🔍 Testing template loading...');
    
    // Test invoice template
    const invoicePath = path.join(__dirname, '../../src/views/templates/invoice.html');
    let invoiceContent, invoiceError;
    try {
      invoiceContent = await fs.readFile(invoicePath, 'utf8');
    } catch (err) {
      invoiceError = err.message;
    }
    
    // Test label template
    const labelPath = path.join(__dirname, '../../src/views/templates/label.html');
    let labelContent, labelError;
    try {
      labelContent = await fs.readFile(labelPath, 'utf8');
    } catch (err) {
      labelError = err.message;
    }
    
    // Return test results
    return successResponse(res, {
      invoice: {
        path: invoicePath,
        success: !!invoiceContent,
        contentLength: invoiceContent?.length || 0,
        sample: invoiceContent?.substring(0, 50) || null,
        error: invoiceError
      },
      label: {
        path: labelPath,
        success: !!labelContent,
        contentLength: labelContent?.length || 0,
        sample: labelContent?.substring(0, 50) || null,
        error: labelError
      }
    });
  } catch (error) {
    console.error('Error in template debug endpoint:', error);
    return errorResponse(res, 'Error testing template loading', error);
  }
});

/**
 * GET /print/static-invoice
 * Return a static invoice HTML for testing
 */
router.get('/static-invoice', async (req, res) => {
  try {
    const staticHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Static Invoice Test</title>
      <style>
        body { font-family: Arial; }
      </style>
    </head>
    <body>
      <h1>Static Invoice</h1>
      <p>This is a static test invoice to verify routes are working.</p>
      <p>Current time: ${new Date().toISOString()}</p>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(staticHtml);
  } catch (error) {
    console.error('Error serving static invoice:', error);
    return errorResponse(res, 'Error serving static invoice', error);
  }
});

module.exports = router; 