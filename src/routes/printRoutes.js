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
const kiotvietController = require('../controllers/kiotvietController');
const printController = require('../controllers/printController');

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
 * GET /print/jobs query params: print_agent_id
 * Get pending print jobs
 */
router.get('/jobs', basicAuth, async (req, res) => {
  try {
    const { print_agent_id } = req.query;
    const jobs = await printService.getPendingPrintJobs(print_agent_id);
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
    const { doc_ref, doc_type, print_agent_id } = req.body;

    // Validate doc_type
    if (!doc_type) {
      return validationError(res, 'doc_type is required');
    }

    const validDocTypes = ['invoice','label'];
    if (!validDocTypes.includes(doc_type)) {
      return validationError(res, 'Invalid doc_type. Must be either "invoice" or "label"');
    }

    // Create print job
    const job = await printService.createPrintJob(doc_ref, doc_type, print_agent_id);
    return successResponse(res, job, 201);
  } catch (error) {
    return errorResponse(res, 'Failed to create print job', error);
  }
});

/**
 * PUT /print/jobs/:id
 * Update a print job status
 */
router.put('/jobs/:id', basicAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return badRequestError(res, 'Missing status in request body');
    }

    // Check if job exists
    const { data: existingJob, error: checkError } = await db.getRecordByField('glt_print_jobs', 'id', id);

    if (checkError || !existingJob) {
      return notFoundError(res, 'Print job not found');
    }

    // Update job
    const updatedJob = await printService.updatePrintJobStatus(id, status);
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
 * GET /print/price-board
 * Print a price board for a product
 * Query params: product_id or kiotviet_product_id
 */
router.get('/price-board', kiotvietController.getPrintPriceBoard);

// Retail price table route (no auth) - must come BEFORE the :kiotviet_customer_id route
router.get('/price-table/retail', printController.getPrintRetailPriceTable);

// Customer price table route
router.get('/price-table/:kiotviet_customer_id', printController.getPrintPriceTable);

// Changelog route (no auth)
router.get('/changelog', printController.getChangelog);

module.exports = router; 