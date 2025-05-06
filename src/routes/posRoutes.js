const express = require("express");
const router = express.Router();
const { basicAuth } = require("../middlewares/auth");
const axios = require("axios");
const { getKiotVietHeaders, cloneInvoiceByCode } = require("../services/kiotvietService");
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Apply basic authentication to all POS routes
router.use(basicAuth);

/**
 * POST /new-glt-invoice
 * Logs and forwards the payload to KiotViet API
 */
router.post("/new-glt-invoice", async (req, res) => {
  const payload = req.body;
  console.log("📥 New gaolamthuy-pos invoice payload:", payload);
  console.log("🔍 Debug: built invoicePayload, now entering try block");

  // Build KiotViet API payload
  const invoicePayload = {
    branchId: 15132,
    isApplyVoucher: false,
    saleChannelId : 185336,
    // purchaseDate: payload.purchase_date || null,
    customerId: payload.kiotviet_customer_id || null,
    discount: payload.invoice_discount || 0,
    totalPayment: payload.total_payment || null,
    description: payload.note,
    method: "Cash", // default
    accountId: null, //default
    usingCod: false, // default
    soldById: 28310, // default
    orderId: null, // default
    invoiceDetails: Array.isArray(payload.items)
      ? payload.items.map(item => ({
          productId: item.product_id,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount_per_unit || 0,
          note: item.note || "",
        }))
      : [],
    deliveryDetail: null,
    // Payments: null,
  };

  try {
    console.log("🔍 Debug: inside try block - fetching headers");
    const headers = await getKiotVietHeaders();
    console.log("🔍 Debug: headers retrieved:", headers);
    const apiUrl = `${process.env.KIOTVIET_PUBLIC_API_URL || 'https://public.kiotapi.com'}/invoices`;
    console.log("➡️ Posting to KiotViet:", apiUrl);
    const response = await axios.post(apiUrl, invoicePayload, { headers });
    console.log("🔍 Debug: axios.post completed");
    console.log("✅ KiotViet response:", response.data);
    // Immediately clone this posted invoice by its KiotViet code
    const invoiceCode = response.data.code;
    console.log(`🔄 Cloning invoice by code: ${invoiceCode}`);
    const cloneResult = await cloneInvoiceByCode(invoiceCode);
    console.log("✅ cloneInvoiceByCode result:", cloneResult);
    return successResponse(res, response.data);
  } catch (error) {
    console.error("❌ Failed to post invoice to KiotViet:", error.response?.data || error.message);
    return errorResponse(res, 'Failed to post invoice to KiotViet', error.response?.data || error.message);
  }
});

module.exports = router; 