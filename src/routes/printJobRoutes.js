const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { basicAuth } = require('../middlewares/auth');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * GET /print/jobs
 * Get pending print jobs
 */
router.get('/', basicAuth, async (req, res) => {
  try {
    const { data: jobs, error } = await supabase
      .from('glt_print_jobs')
      .select('*, kv_invoices(code)')
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
router.post('/', basicAuth, async (req, res) => {
    try {
      const { kiotviet_invoice_id, kiotviet_invoice_code, doc_type } = req.body;
  
      // Validate doc_type
      if (!doc_type) {
        return res.status(400).json({
          success: false,
          message: 'doc_type is required'
        });
      }
  
      const validDocTypes = ['invoice-a5', 'invoice-80', 'label'];
      if (!validDocTypes.includes(doc_type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid doc_type. Must be either "invoice-a5" or "invoice-80" or "label"'
        });
      }
  
      // Ensure exactly one of `kiotviet_invoice_id` or `kiotviet_invoice_code` is provided
      const hasId = !!kiotviet_invoice_id;
      const hasCode = !!kiotviet_invoice_code;
  
      if ((hasId && hasCode) || (!hasId && !hasCode)) {
        return res.status(400).json({
          success: false,
          message: 'Provide exactly one of kiotviet_invoice_id or kiotviet_invoice_code'
        });
      }
  
      // Find invoice using the provided key
      const { data: invoice, error: invoiceError } = await supabase
        .from('kv_invoices')
        .select('kiotviet_id')
        .eq(hasId ? 'kiotviet_id' : 'code', hasId ? kiotviet_invoice_id : kiotviet_invoice_code)
        .single();
  
      if (invoiceError || !invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }
  
      // Create print job
      const { data: job, error: insertError } = await supabase
        .from('glt_print_jobs')
        .insert([{
          kiotviet_invoice_id: invoice.kiotviet_id,
          doc_type,
          status: 'pending'
        }])
        .select()
        .single();
  
      if (insertError) {
        console.error('Error creating print job:', insertError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create print job',
          error: insertError.message
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
router.put('/:id', basicAuth, async (req, res) => {
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

module.exports = router; 