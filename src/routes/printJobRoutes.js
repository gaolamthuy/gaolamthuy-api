const express = require('express');
const router = express.Router();
const printService = require('../services/printService');
const db = require('../utils/database');
const { basicAuth } = require('../middlewares/auth');
const { successResponse, errorResponse, validationError, notFoundError } = require('../utils/responseHandler');

/**
 * GET /print/jobs
 * Get pending print jobs
 */
router.get('/', basicAuth, async (req, res) => {
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
router.post('/', basicAuth, async (req, res) => {
  try {
    const { kiotviet_invoice_id, kiotviet_invoice_code, doc_type } = req.body;

    // Validate doc_type
    if (!doc_type) {
      return validationError(res, 'doc_type is required');
    }

    const validDocTypes = ['invoice-a5', 'invoice-80', 'label'];
    if (!validDocTypes.includes(doc_type)) {
      return validationError(res, 'Invalid doc_type. Must be either "invoice-a5" or "invoice-80" or "label"');
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
router.put('/:id', basicAuth, async (req, res) => {
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

module.exports = router; 