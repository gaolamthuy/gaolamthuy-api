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

// Generate price table images for all active categories or via query param ?category_id=123
router.get("/price-table/generate", mediaController.generatePriceTableImages);

// Generate price table image for a single category (using route param)
router.get(
  "/price-table/generate/:category_id",
  mediaController.generatePriceTableImages
);

module.exports = router;
