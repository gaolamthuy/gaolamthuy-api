const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { format } = require('date-fns');
const { vi } = require('date-fns/locale');
const { formatInTimeZone } = require('date-fns-tz');
const path = require('path');
const fs = require('fs').promises;
const printJobRoutes = require('./printJobRoutes');
const printService = require('../services/printService');
const { htmlResponse, errorResponse } = require('../utils/responseHandler');

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
      return errorResponse(res, 'Invoice code is required', null, 400);
    }
    
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
    
    if (!code) {
      return errorResponse(res, 'Product code is required', null, 400);
    }
    
    const html = await printService.generateProductLabelPrint(code, quantity);
    return htmlResponse(res, html);
  } catch (error) {
    console.error('Error generating product label print:', error);
    return errorResponse(res, 'Error generating product label print', error);
  }
});

module.exports = router; 