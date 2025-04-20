const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const basicAuth = require('../middlewares/basicAuth');
const upload = require('../middlewares/upload');

// Apply basic authentication middleware to all routes
router.use(basicAuth);

// Media upload route - now uses tags to identify the product
router.post('/upload', upload.single('image'), mediaController.handleUploadAndUpdateManifest);

// Get all products with custom images
router.get('/products', mediaController.getProductImages);

// Add a new product with tags (admin functionality)
router.post('/products', mediaController.addProductWithTags);

// Add a new route for manually generating the manifest
router.get('/manifest/generate', mediaController.updateImageManifest);

module.exports = router; 