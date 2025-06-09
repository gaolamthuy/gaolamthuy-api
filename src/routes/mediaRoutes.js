const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const { basicAuth } = require("../middlewares/auth");
const upload = require("../middlewares/upload");

// Apply basic authentication middleware to all routes
router.use(basicAuth);

// Media upload route - uses tags to identify the product
router.post("/upload", upload.single("file"), mediaController.handleUpload);

// Get all products with custom images
router.get("/products", mediaController.getProductImages);

// Manually generate the manifest
router.get("/manifest/generate", mediaController.updateImageManifest);

// Generate price table images for all active categories (batch processing) - DEPRECATED
router.get("/price-table/generate", mediaController.generatePriceTableImages);

// Generate retail price table images (card-style layout with categories)
router.get(
  "/price-table/generate/retail",
  mediaController.generateRetailPriceTableImages
);

// Generate wholesale price table images (clean layout, full page)
router.get(
  "/price-table/generate/whole",
  mediaController.generateWholesalePriceTableImages
);

module.exports = router;
