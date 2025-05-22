const express = require("express");
const router = express.Router();
const {
  handleTransaction,
  getRecentPayments,
} = require("../controllers/paymentController");
const { basicAuth } = require("../middlewares/auth");

// Apply basic authentication to all payment routes
router.use(basicAuth);

// POST /payment - Handle incoming payment transactions
router.post("/", handleTransaction);

// GET /payment/recent-payments - Get recent payment transactions
router.get("/recent-payments", getRecentPayments);

module.exports = router;
