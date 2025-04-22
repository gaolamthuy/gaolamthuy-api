const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const { uploadToS3 } = require('../utils/s3');
const supabase = require('../utils/database');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Handle media uploads and apply image processing
 */
const handleUpload = async (req, res) => {
  try {
    // Check if a file was uploaded
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "No file uploaded" 
      });
    }
    
    // Check if tag was provided
    const { tags } = req.body;
    if (!tags || typeof tags !== 'string' || !tags.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: "A tag string is required to identify the product" 
      });
    }
    
    // Sanitize the tag
    const tagString = tags.trim();
    
    console.log(`🔍 Searching for product with tag: ${tagString}`);
    
    // Find products that have this tag in their tags array
    let matchingProducts;
    const { data: exactMatches, error: searchError } = await supabase
      .from('glt_products')
      .select('*')
      .contains('tags', [tagString]);
    
    matchingProducts = exactMatches;
    
    if (searchError) {
      console.error('❌ Error searching for product by tag:', searchError);
      throw searchError;
    }
    
    // Check if we found any product
    if (!matchingProducts || matchingProducts.length === 0) {
      // Try with a case-insensitive search as fallback
      console.log('⚠️ No exact match found, trying case-insensitive search');
      
      // Get all products and filter for case-insensitive match
      const { data: allProducts } = await supabase
        .from('glt_products')
        .select('*');
        
      if (allProducts && allProducts.length > 0) {
        const caseInsensitiveMatches = allProducts.filter(p => 
          p.tags.some(tag => tag.toLowerCase() === tagString.toLowerCase())
        );
        
        if (caseInsensitiveMatches.length > 0) {
          console.log(`✅ Found ${caseInsensitiveMatches.length} matches with case-insensitive search`);
          matchingProducts = caseInsensitiveMatches;
        } else {
          return res.status(404).json({ 
            success: false, 
            message: `No product found with tag: ${tagString}` 
          });
        }
      } else {
        return res.status(404).json({ 
          success: false, 
          message: `No product found with tag: ${tagString}` 
        });
      }
    }
    
    // Use the first match if multiple products are found
    const product = matchingProducts[0];
    
    if (matchingProducts.length > 1) {
      console.log(`⚠️ Multiple products (${matchingProducts.length}) found with tag: ${tagString}. Using first match.`);
    }
    
    // Get product details
    const kiotvietId = product.kiotviet_id;
    const slug = product.slug;
    
    console.log(`✅ Found product with kiotvietId: ${kiotvietId}, slug: ${slug}`);
    
    // Process image with sharp
    const imagePath = req.file.path;
    const imageInfo = await sharp(imagePath).metadata();
    
    console.log(`🖼️ Original image dimensions: ${imageInfo.width} x ${imageInfo.height}, format: ${imageInfo.format}`);
    
    // Generate new timestamp for image_updated_at
    const imageUpdatedAt = Date.now();
    
    // Create temporary directories for processed images
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Process thumbnail version (300px width, webp format)
    const thumbnailPath = path.join(tempDir, `${slug}-thumbnail.webp`);
    await sharp(imagePath)
      .resize(300) // resize to 300px width, maintain aspect ratio
      .webp({ quality: 80 }) // convert to webp with quality setting for 60-90kb size
      .toFile(thumbnailPath);
      
    // Process zoom version (1200px width, webp format)
    const zoomPath = path.join(tempDir, `${slug}-zoom.webp`);
    await sharp(imagePath)
      .resize(1200) // resize to 1200px width, maintain aspect ratio
      .webp({ quality: 85 }) // convert to webp with quality setting for 250-300kb size
      .toFile(zoomPath);
    
    // Get thumbnail dimensions and size
    const thumbnailInfo = await sharp(thumbnailPath).metadata();
    const thumbnailStats = fs.statSync(thumbnailPath);
    
    // Get zoom dimensions and size
    const zoomInfo = await sharp(zoomPath).metadata();
    const zoomStats = fs.statSync(zoomPath);
    
    console.log(`🖼️ Thumbnail: ${thumbnailInfo.width}x${thumbnailInfo.height}, ${Math.round(thumbnailStats.size / 1024)}KB`);
    console.log(`🖼️ Zoom: ${zoomInfo.width}x${zoomInfo.height}, ${Math.round(zoomStats.size / 1024)}KB`);
    
    // Upload thumbnail to S3
    const thumbnailKey = `product-images/dynamic/thumbnail/${slug}.webp`;
    const thumbnailS3Result = await uploadToS3(thumbnailPath, `${slug}.webp`, thumbnailKey);
    
    // Upload zoom version to S3
    const zoomKey = `product-images/dynamic/zoom/${slug}.webp`;
    const zoomS3Result = await uploadToS3(zoomPath, `${slug}.webp`, zoomKey);
    
    // Update product information with only image_updated_at 
    const { data: updatedProduct, error: updateError } = await supabase
      .from('glt_products')
      .update({
        image_updated_at: imageUpdatedAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', product.id)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error updating product in database:', updateError);
      throw updateError;
    }
    
    // Cleanup temp files
    fs.unlinkSync(imagePath); // Delete original uploaded file
    fs.unlinkSync(thumbnailPath); // Delete thumbnail temp file
    fs.unlinkSync(zoomPath); // Delete zoom temp file
    
    // Construct CDN URLs for response
    const thumbnailUrl = process.env.CDN_ENDPOINT 
      ? `${process.env.CDN_ENDPOINT}/product-images/dynamic/thumbnail/${slug}.webp?v=${imageUpdatedAt}` 
      : thumbnailS3Result.url;
      
    const zoomUrl = process.env.CDN_ENDPOINT
      ? `${process.env.CDN_ENDPOINT}/product-images/dynamic/zoom/${slug}.webp?v=${imageUpdatedAt}` 
      : zoomS3Result.url;
    
    res.status(200).json({ 
      success: true, 
      message: "File processed and product updated successfully",
      product: updatedProduct,
      images: {
        thumbnail: {
          url: thumbnailUrl,
          width: thumbnailInfo.width,
          height: thumbnailInfo.height,
          size: Math.round(thumbnailStats.size / 1024)
        },
        zoom: {
          url: zoomUrl,
          width: zoomInfo.width,
          height: zoomInfo.height,
          size: Math.round(zoomStats.size / 1024)
        }
      }
    });
  } catch (error) {
    console.error("❌ Error processing upload:", error);
    
    // Attempt to clean up any temp files if they exist
    try {
      const tempDir = path.join(__dirname, '../../uploads/temp');
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      // Clean up any other temp files that might have been created
      const slug = req.body?.slug;
      if (slug) {
        const thumbnailPath = path.join(tempDir, `${slug}-thumbnail.webp`);
        const zoomPath = path.join(tempDir, `${slug}-zoom.webp`);
        
        if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
        if (fs.existsSync(zoomPath)) fs.unlinkSync(zoomPath);
      }
    } catch (cleanupError) {
      console.error("❌ Error during cleanup:", cleanupError);
    }
    
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get all products with custom images
 */
const getProductImages = async (req, res) => {
  try {
    // Parse query parameters
    const { visible, limit = 50, offset = 0, tags } = req.query;
    
    // Build query
    let query = supabase
      .from('glt_products')
      .select(`
        *,
        kiotviet_products(id, kiotviet_id, name, full_name, code, category_name)
      `)
      .order('sort_order', { ascending: true, nullsLast: true })
      .order('id', { ascending: true });
    
    // Add filters
    if (visible === 'true') {
      query = query.eq('visible', true);
    } else if (visible === 'false') {
      query = query.eq('visible', false);
    }
    
    // Filter by tags if provided
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      query = query.contains('tags', tagArray);
    }
    
    // Add pagination
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    // Execute query
    const { data, error, count } = await query;
    
    if (error) {
      console.error('❌ Error fetching products:', error);
      throw error;
    }
    
    // Get total count
    const { count: totalCount, error: countError } = await supabase
      .from('glt_products')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Error counting products:', countError);
    }
    
    res.status(200).json({
      success: true,
      data,
      pagination: {
        total: totalCount || 0,
        offset: parseInt(offset),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('❌ Error getting product images:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add a new product with tags (admin functionality)
 */
const addProductWithTags = async (req, res) => {
  try {
    const { kiotviet_id, tags, note, visible = true } = req.body;
    
    if (!kiotviet_id) {
      return res.status(400).json({
        success: false,
        message: "kiotviet_id is required"
      });
    }
    
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        success: false,
        message: "tags array is required with at least one tag"
      });
    }
    
    // Check if kiotviet_id exists in kiotviet_products
    const { data: kiotvietProduct, error: kiotvietError } = await supabase
      .from('kiotviet_products')
      .select('*')
      .eq('kiotviet_id', kiotviet_id)
      .single();
    
    if (kiotvietError) {
      return res.status(404).json({
        success: false,
        message: `No KiotViet product found with ID: ${kiotviet_id}`
      });
    }
    
    // Check if product already exists in glt_products
    const { data: existingProduct, error: existingError } = await supabase
      .from('glt_products')
      .select('*')
      .eq('kiotviet_id', kiotviet_id)
      .single();
    
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: `Product with kiotviet_id ${kiotviet_id} already exists in glt_products`
      });
    }
    
    // Create new product
    const { data: newProduct, error: insertError } = await supabase
      .from('glt_products')
      .insert({
        kiotviet_id,
        tags,
        note,
        visible
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Error creating product:', insertError);
      throw insertError;
    }
    
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
      kiotviet_product: kiotvietProduct
    });
  } catch (error) {
    console.error('❌ Error adding product with tags:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Generate and upload a JSON manifest file for all product images
 * This should be called after uploading new images or on a schedule
 */
const updateImageManifest = async (req, res) => {
  // Set a 30-second timeout for the entire operation
  const TIMEOUT_MS = 30000;
  let timeoutId = null;
  
  if (res) {
    // Set a timeout to ensure we always respond
    timeoutId = setTimeout(() => {
      console.log('⚠️ Operation timed out after', TIMEOUT_MS, 'ms');
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Operation timed out',
          message: 'The manifest generation took too long and timed out'
        });
      }
    }, TIMEOUT_MS);
  }
  
  try {
    console.log('Starting image manifest generation...');
    console.log('Request received with method:', req?.method);
    console.log('Auth header present:', req?.headers?.authorization ? 'Yes' : 'No');
    
    // Get all products with images (image_updated_at is not null)
    const { data: products, error } = await supabase
      .from('glt_products')
      .select('id, kiotviet_id, slug, tags, image_updated_at, sort_order, visible')
      .order('sort_order', { ascending: true, nullsLast: true })
      .order('id', { ascending: true })
      .not('image_updated_at', 'is', null);
    
    if (error) {
      console.error('❌ Error fetching products for manifest:', error);
      throw error;
    }
    
    console.log(`Found ${products.length} products with images`);
    
    // Build the image manifest
    const manifest = {
      lastUpdated: new Date().toISOString(),
      version: 1,
      totalCount: products.length,
      images: products.map(product => {
        const cdnBase = process.env.CDN_ENDPOINT || '';
        const versionParam = `?v=${product.image_updated_at}`;
        
        return {
          id: product.id,
          kiotvietId: product.kiotviet_id,
          slug: product.slug,
          tags: product.tags,
          updatedAt: product.image_updated_at,
          visible: product.visible,
          sortOrder: product.sort_order,
          urls: {
            thumbnail: `${cdnBase}/product-images/dynamic/thumbnail/${product.slug}.webp${versionParam}`,
            zoom: `${cdnBase}/product-images/dynamic/zoom/${product.slug}.webp${versionParam}`
          }
        };
      })
    };
    
    // Save manifest to a temp file
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const manifestPath = path.join(tempDir, 'product-images-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    console.log(`Manifest file created at ${manifestPath}`);
    console.log(`File size: ${fs.statSync(manifestPath).size} bytes`);
    
    // Upload to S3 using putObject which our tests confirm works
    const manifestKey = 'product-images/manifest.json';
    let manifestUrl = '';
    
    try {
      console.log(`Uploading manifest to S3...`);
      console.log(`S3 Endpoint: ${process.env.S3_ENDPOINT}`);
      console.log(`S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
      console.log(`S3 Key: ${manifestKey}`);
      
      // Use the S3 client from our utils
      const { s3 } = require('../utils/s3');
      
      // Set a shorter timeout for S3 operations
      const AWS = require('aws-sdk');
      AWS.config.httpOptions = { timeout: 15000 };
      
      console.log('Preparing putObject params...');
      const putParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: manifestKey,
        Body: fs.readFileSync(manifestPath),
        ContentType: 'application/json',
        CacheControl: 'max-age=60'
      };
      
      console.log('Executing putObject...');
      const putResult = await s3.putObject(putParams).promise();
      
      console.log('Upload completed successfully');
      console.log(`Upload result:`, JSON.stringify(putResult));
      console.log(`Manifest uploaded to S3 bucket: ${process.env.S3_BUCKET_NAME}, key: ${manifestKey}`);
      
      // Create manifest URL only after successful upload
      manifestUrl = process.env.CDN_ENDPOINT 
        ? `${process.env.CDN_ENDPOINT}/${manifestKey}?v=${Date.now()}` 
        : `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${manifestKey}?v=${Date.now()}`;
      
      console.log(`✅ Image manifest updated at: ${manifestUrl}`);
    } catch (uploadError) {
      console.error('❌ Error uploading manifest to S3:', uploadError);
      
      // Log more details about the error
      console.error('Error details:', uploadError.message);
      console.error('Error stack:', uploadError.stack);
      if (uploadError.code) {
        console.error('Error code:', uploadError.code);
      }
      if (uploadError.statusCode) {
        console.error('Status code:', uploadError.statusCode);
      }
      if (uploadError.region) {
        console.error('Region:', uploadError.region);
      }
      
      // Print S3 config for debugging (excluding secrets)
      console.log('S3 Configuration:');
      console.log(`  Endpoint: ${process.env.S3_ENDPOINT}`);
      console.log(`  Bucket: ${process.env.S3_BUCKET_NAME}`);
      console.log(`  Region: ${process.env.S3_REGION || 'auto'}`);
      console.log(`  Access Key ID: ${process.env.S3_ACCESS_KEY ? '******' : 'Not set'}`);
      
      // Clean up before throwing error
      try {
        if (fs.existsSync(manifestPath)) {
          fs.unlinkSync(manifestPath);
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
      
      // Throw the error but first check if we need to respond
      if (res && !res.headersSent) {
        clearTimeout(timeoutId);
        return res.status(500).json({ 
          success: false, 
          error: 'S3 upload failed', 
          details: uploadError.message,
          code: uploadError.code
        });
      }
      
      throw uploadError;
    }
    
    // Clean up temp file
    try {
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
        console.log('Temporary file deleted');
      }
    } catch (cleanupError) {
      console.error('Error cleaning up:', cleanupError);
    }
    
    // Clear timeout and send response if needed
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    if (res && !res.headersSent) {
      console.log('Sending success response');
      return res.status(200).json({
        success: true,
        message: "Image manifest updated successfully",
        url: manifestUrl,
        productCount: products.length
      });
    }
    
    return manifestUrl;
  } catch (error) {
    console.error("❌ Error updating image manifest:", error);
    
    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    if (res && !res.headersSent) {
      console.log('Sending error response');
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
    
    throw error;
  }
};

// Automatically update the manifest file after successful image upload
const handleUploadAndUpdateManifest = async (req, res) => {
  try {
    // First handle the upload normally
    await handleUpload(req, res);
    
    // After successful upload, update the manifest in the background
    updateImageManifest().catch(error => {
      console.error("❌ Background manifest update failed:", error);
    });
  } catch (error) {
    // If the upload failed, just pass the error through
    console.error("❌ Error in upload process:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  handleUpload,
  getProductImages,
  addProductWithTags,
  updateImageManifest,
  handleUploadAndUpdateManifest
}; 