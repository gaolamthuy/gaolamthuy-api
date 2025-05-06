const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const { registerFonts } = require('../assets/fonts');

// Register all fonts
registerFonts();

const { uploadToS3 } = require('../utils/s3');
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Generate a slug from product name or code
 * @param {Object} product - The product object
 * @returns {string} A slug string
 */
const generateProductSlug = (product) => {
  let baseSlug = '';
  
  // Use name as primary source if available
  if (product.name) {
    baseSlug = product.name.toLowerCase();
  } 
  // Fallback to code
  else if (product.code) {
    baseSlug = product.code.toLowerCase();
  } 
  // Last resort, use kiotviet_id with prefix
  else {
    baseSlug = `product-${product.kiotviet_id}`;
  }
  
  // Replace special characters and spaces with dashes
  let slug = baseSlug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric chars except spaces and dashes
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Replace multiple dashes with single dash
    .trim();
    
  // Add kiotviet_id at the end to ensure uniqueness
  return `${slug}-${product.kiotviet_id}`;
};

const getShortPriceString = async (productId) => {
  const { data: inventory } = await supabase
    .from('kv_product_inventories')
    .select('cost')
    .eq('product_id', productId)
    .limit(1)
    .single();

  if (!inventory || !inventory.cost) return null;

  const cost = parseFloat(inventory.cost) + 2000;
  const costShort = (cost / 1000).toFixed(1);

  const { data: product } = await supabase
    .from('kv_products')
    .select('base_price')
    .eq('id', productId)
    .single();

  if (!product || !product.base_price) return null;

  const basePriceShort = (parseFloat(product.base_price) / 1000).toFixed(1);

  return `${basePriceShort}/${costShort}`;
};


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
    const { tags, overlayText } = req.body;
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
      .from('kv_products')
      .select('*, glt_gallery_thumbnail_title')
      .contains('glt_tags', [tagString]);
    
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
        .from('kv_products')
        .select('*, glt_gallery_thumbnail_title');
        
      if (allProducts && allProducts.length > 0) {
        const caseInsensitiveMatches = allProducts.filter(p => 
          p.glt_tags && Array.isArray(p.glt_tags) && 
          p.glt_tags.some(tag => tag && tag.toLowerCase() === tagString.toLowerCase())
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
    let slug = product.glt_slug;
    const categoryId = product.category_id;

    
    // Get thumbnail title from product
    let thumbnailTitle = product.glt_gallery_thumbnail_title || overlayText || '';
    console.log(`📝 Debug - Product details retrieved:`, {
      kiotvietId,
      name: product.name,
      slug,
      categoryId,
      hasGltGalleryThumbnailTitle: !!product.glt_gallery_thumbnail_title,
      glt_gallery_thumbnail_title: product.glt_gallery_thumbnail_title,
      hasOverlayText: !!overlayText,
      overlayText,
      finalThumbnailTitle: thumbnailTitle
    });
    
    // Get short price text
    // Thêm giá sản phẩm vào thumbnail title
    const shortPriceText = await getShortPriceString(product.id);
    if (shortPriceText) {
      thumbnailTitle += `\n${shortPriceText}`;
    }
    console.log(`📝 Debug - Thumbnail title with short price: "${thumbnailTitle}"`);

    // Generate slug if it doesn't exist
    if (!slug) {
      slug = generateProductSlug(product);
      console.log(`🔖 Generated new slug for product: ${slug}`);
      
      // Update the product with the new slug
      const { error: slugUpdateError } = await supabase
        .from('kv_products')
        .update({ glt_slug: slug })
        .eq('kiotviet_id', kiotvietId);
        
      if (slugUpdateError) {
        console.error('❌ Error updating product slug:', slugUpdateError);
        // Continue even if there's an error, using the generated slug in memory
        console.log('⚠️ Continuing with generated slug in memory, without saving to database');
      }
    }
    
    // Final check to ensure we have a slug
    if (!slug) {
      slug = `product-${kiotvietId}-${Date.now()}`;
      console.log(`⚠️ Using fallback slug: ${slug}`);
    }
    
    console.log(`✅ Found product with kiotvietId: ${kiotvietId}, slug: ${slug}, categoryId: ${categoryId}`);
    
    // Get category color border if available
    let borderColor = '#ffb96e'; // Default color
    if (categoryId) {
      try {
        // First try to lookup by category_id (as stored in kv_products)
        const { data: category } = await supabase
          .from('kv_product_categories')
          .select('category_name, glt_color_border, category_id')
          .eq('category_id', categoryId)
          .single();
        
        if (category) {
          console.log(`✅ Found category: ${category.category_name} with ID ${categoryId}`);
          categoryName = category.category_name || 'Không xác định';
          borderColor = category.glt_color_border || borderColor;
          console.log(`🎨 Using category border color: ${borderColor}`);
        } else {
          // Try alternate lookup - sometimes the categoryId is stored differently
          console.log(`⚠️ Category with ID ${categoryId} not found in first lookup, trying alternate lookup`);
          
          const { data: altCategory } = await supabase
            .from('kv_product_categories')
            .select('category_name, glt_color_border, category_id')
            .limit(100);
            
          if (altCategory && altCategory.length > 0) {
            console.log(`📋 Found ${altCategory.length} categories to check against`);
            const found = altCategory.find(cat => String(cat.category_id) === String(categoryId));
            
            if (found) {
              console.log(`✅ Found category via alternate lookup: ${found.category_name} with ID ${found.category_id}`);
              categoryName = found.category_name || 'Không xác định';
              borderColor = found.glt_color_border || borderColor;
            } else {
              console.warn(`⚠️ Category with ID ${categoryId} not found in either lookup, using default values`);
            }
          } else {
            console.warn(`⚠️ No categories found in database, using default values`);
          }
        }
      } catch (categoryError) {
        console.error(`❌ Error fetching category: ${categoryError.message}`);
        console.log(`⚠️ Using default color value`);
      }
    }
    
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
    
    // Define paths for processed images
    const thumbnailPath = path.join(tempDir, `${slug}-thumbnail.webp`);
    const zoomPath = path.join(tempDir, `${slug}-zoom.webp`);
    const resizedThumbnailPath = path.join(tempDir, `${slug}-resized-thumbnail.png`);
    
    // First resize the thumbnail image (300x300)
    const resizedBlurredPath = path.join(tempDir, `${slug}-resized-blur.png`);
    await sharp(imagePath)
      .resize(300, 300, {
        fit: 'cover',
        position: 'center'
      })
      .blur(2.5) // 💡 bạn có thể chỉnh từ 1.5 đến 3.0 tùy ảnh
      .png()
      .toFile(resizedBlurredPath);
    
    
    // Now apply canvas overlay with border and text (if provided)
    console.log(`🔍 Debug - Canvas preparation:`, {
      hasThumbnailTitle: !!thumbnailTitle,
      thumbnailTitleLength: thumbnailTitle ? thumbnailTitle.length : 0,
      borderColor,
      willUseCanvas: !!thumbnailTitle,
      resizedImagePath: resizedThumbnailPath,
      resizedImageFormat: 'PNG'
    });
    
    // Handle escape sequences in the title text
    if (thumbnailTitle && thumbnailTitle.includes('\\n')) {
      thumbnailTitle = thumbnailTitle.replace(/\\n/g, '\n');
      console.log(`📝 Processed escape sequences in title: "${thumbnailTitle}"`);
    }
    
    if (thumbnailTitle) {
      try {
        console.log(`🎨 Creating canvas with border color ${borderColor} and text overlay`);
        const width = 300;
        const height = 300;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Load the resized image
        console.log(`🖼️ Loading resized image for canvas: ${resizedThumbnailPath}`);
        const image = await loadImage(resizedBlurredPath);
        console.log(`✅ Image loaded successfully: ${image.width}x${image.height}`);
        
        // Draw a border (5px) using the category color
        ctx.fillStyle = borderColor;
        ctx.fillRect(0, 0, width, height);
        console.log(`🎨 Drew border rectangle with color: ${borderColor}`);
        
        // Draw the image inside the border
        ctx.drawImage(image, 5, 5, width - 10, height - 10);
        console.log(`🖼️ Drew image inside border`);
        
        // Add text overlay
        console.log(`✏️ Adding text overlay: "${thumbnailTitle.substring(0, 20)}${thumbnailTitle.length > 20 ? '...' : ''}"`);

        // Handle multiline text
        const lines = thumbnailTitle.split('\n');
        console.log(`📝 Split text into ${lines.length} lines:`, lines);
        
        const lineHeight = 42;
        const baseY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
        console.log(`📐 Text positioning - baseY: ${baseY}, lineHeight: ${lineHeight}`);
        
        // // Semi-transparent background for text
        // ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        // ctx.fillRect(5, height - 85, width - 10, 80);
        // console.log(`🎨 Drew semi-transparent background for text`);
        
        // 2. Nền mờ sau chữ:
        ctx.fillStyle = borderColor;
        // ctx.fillRect(10, height / 2 - (lines.length * 20), width - 20, lines.length * 42);

        // 3. Text settings
        // 5 cases for 
        ctx.font =  lines.length === 1 ? 'bold 60px "Nunito"' : // 1 line 
                    lines.length === 2 ? 'bold 50px "Nunito"' : // 2 lines
                    lines.length === 3 ? 'bold 40px "Nunito"' : // 3 lines
                    lines.length === 4 ? 'bold 40px "Nunito"' : // 4 lines
                                         'bold 30px "Nunito"'; // 5 lines
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = borderColor;
        ctx.shadowBlur = 3;
        
        lines.forEach((line, i) => {
          const y = baseY + i * lineHeight;
          ctx.strokeText(line, width / 2, y);
          ctx.fillText(line, width / 2, y);
          console.log(`✏️ Drew line ${i+1}: "${line}" at y=${y}`);
        });
        
        // Save the canvas to file (as WebP for final output)
        console.log(`💾 Saving canvas to file: ${thumbnailPath}`);
        
        // First save as PNG (better canvas compatibility)
        const tempPngPath = path.join(tempDir, `${slug}-canvas-output.png`);
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(tempPngPath, buffer);
        console.log(`✅ Canvas saved to temporary PNG: ${tempPngPath}, size: ${buffer.length} bytes`);
        
        // Then convert to WebP with sharp
        await sharp(tempPngPath)
          .webp({ quality: 80 })
          .toFile(thumbnailPath);
        console.log(`✅ Converted canvas output to WebP: ${thumbnailPath}`);
        
        // Clean up the temporary PNG
        if (fs.existsSync(tempPngPath)) {
          fs.unlinkSync(tempPngPath);
          console.log(`🗑️ Deleted temporary PNG file: ${tempPngPath}`);
        }
      } catch (canvasError) {
        console.error('❌ Error creating canvas:', canvasError);
        console.log('⚠️ Canvas error details:', {
          errorName: canvasError.name,
          errorMessage: canvasError.message,
          errorStack: canvasError.stack,
        });
        console.log('⚠️ Falling back to simple border using sharp');
        
        // If canvas fails, fall back to simple border with sharp
        await sharp(resizedThumbnailPath)
          .extend({
            top: 5,
            bottom: 5,
            left: 5,
            right: 5,
            background: borderColor
          })
          .webp({ quality: 80 })
          .toFile(thumbnailPath);
          
        console.log(`✅ Fallback thumbnail created with sharp at ${thumbnailPath}`);
      }
    } else {
      console.log(`ℹ️ No thumbnail title provided, using simple border without text`);
      // If no overlay text, add just the border
      console.log(`🎨 Adding simple border with color ${borderColor}`);
      try {
        await sharp(resizedThumbnailPath)
          .extend({
            top: 5,
            bottom: 5,
            left: 5,
            right: 5,
            background: borderColor
          })
          .webp({ quality: 80 })
          .toFile(thumbnailPath);
        
        console.log(`✅ Thumbnail with border saved to ${thumbnailPath}`);
        
        // Delete the resized file now that we have the final thumbnail
        if (fs.existsSync(resizedBlurredPath)) {
          fs.unlinkSync(resizedBlurredPath);
          console.log(`🗑️ Deleted blurred image: ${resizedBlurredPath}`);
        }
        
      } catch (sharpError) {
        console.error('❌ Error adding border with sharp:', sharpError);
        
        // If border extension fails, just use the resized image as is
        console.log('⚠️ Using resized image without border as fallback');
        fs.copyFileSync(resizedThumbnailPath, thumbnailPath);
      }
    }
    
    // Process zoom version (1200px width, webp format)
    await sharp(imagePath)
      .resize({
        width: 1200,
        withoutEnlargement: true
      })
      .webp({ quality: 85 })
      .toFile(zoomPath);
      
    // Process enhanced zoom version with text overlay, logo, and border
    if (categoryId) {
      try {
        await processEnhancedZoomImage(zoomPath, slug, product.id, categoryId, tempDir);
      } catch (enhancedError) {
        console.error('❌ Error creating enhanced zoom image:', enhancedError);
        console.log('⚠️ Continuing with standard zoom image only');
      }
    }
    
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
      .from('kv_products')
      .update({
        glt_image_updated_at: imageUpdatedAt,
        glt_updated_at: new Date().toISOString()
      })
      .eq('kiotviet_id', kiotvietId)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error updating product in database:', updateError);
      throw updateError;
    }
    
    // Cleanup temp files
    fs.unlinkSync(imagePath); // Delete original uploaded file
    fs.unlinkSync(thumbnailPath); // Delete thumbnail temp file
    
    // Construct CDN URLs for response
    const thumbnailUrl = process.env.CDN_ENDPOINT 
      ? `${process.env.CDN_ENDPOINT}/product-images/dynamic/thumbnail/${slug}.webp?v=${imageUpdatedAt}` 
      : thumbnailS3Result.url;
      
    const zoomUrl = process.env.CDN_ENDPOINT
      ? `${process.env.CDN_ENDPOINT}/product-images/dynamic/zoom/${slug}.webp?v=${imageUpdatedAt}` 
      : zoomS3Result.url;
    
    const enhancedUrl = process.env.CDN_ENDPOINT
      ? `${process.env.CDN_ENDPOINT}/product-images/dynamic/zoom/${slug}.webp?v=${imageUpdatedAt}` 
      : null;
    
    res.status(200).json({ 
      success: true, 
      message: "File processed and product updated successfully",
      product: updatedProduct,
      images: {
        thumbnail: {
          url: thumbnailUrl,
          width: thumbnailInfo.width,
          height: thumbnailInfo.height,
          size: Math.round(thumbnailStats.size / 1024),
          borderColor: borderColor
        },
        zoom: {
          url: zoomUrl,
          width: zoomInfo.width,
          height: zoomInfo.height,
          size: Math.round(zoomStats.size / 1024)
        },
        enhanced: {
          url: enhancedUrl
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
        console.log(`🗑️ Cleaned up original uploaded file: ${req.file.path}`);
      }
      
      // Clean up any other temp files that might have been created
      const slug = req.body?.slug || (req.body?.tags ? req.body.tags.trim() : null);
      if (slug) {
        const thumbnailPath = path.join(tempDir, `${slug}-thumbnail.webp`);
        const resizedThumbnailPath = path.join(tempDir, `${slug}-resized-thumbnail.png`);
        const tempPngPath = path.join(tempDir, `${slug}-canvas-output.png`);
        const zoomPath = path.join(tempDir, `${slug}-zoom.webp`);
        
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
          console.log(`🗑️ Cleaned up thumbnail file: ${thumbnailPath}`);
        }
        if (fs.existsSync(resizedThumbnailPath)) {
          fs.unlinkSync(resizedThumbnailPath);
          console.log(`🗑️ Cleaned up resized thumbnail file: ${resizedThumbnailPath}`);
        }
        if (fs.existsSync(tempPngPath)) {
          fs.unlinkSync(tempPngPath);
          console.log(`🗑️ Cleaned up temporary canvas PNG file: ${tempPngPath}`);
        }
        if (fs.existsSync(zoomPath)) {
          fs.unlinkSync(zoomPath);
          console.log(`🗑️ Cleaned up zoom file: ${zoomPath}`);
        }
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
    const { kiotviet_id } = req.params;
    
    if (!kiotviet_id) {
      return res.status(400).json({
        success: false,
        message: "kiotviet_id parameter is required"
      });
    }
    
    // Get product from database
    const { data: product, error } = await supabase
      .from('kv_products')
      .select('*, glt_slug, glt_image_updated_at')
      .eq('kiotviet_id', kiotviet_id)
      .single();
    
    if (error) {
      console.error('❌ Error fetching product:', error);
      return res.status(404).json({
        success: false,
        message: `No product found with KiotViet ID: ${kiotviet_id}`,
        error: error.message
      });
    }
    
    // Check if product has images
    if (!product.glt_slug || !product.glt_image_updated_at) {
      return res.status(404).json({
        success: false,
        message: `No images found for product with KiotViet ID: ${kiotviet_id}`
      });
    }
    
    // Build image URLs with cache-busting version parameter
    const cdnBase = process.env.CDN_ENDPOINT || '';
    const versionParam = `?v=${product.glt_image_updated_at}`;
    
    const imageUrls = {
      thumbnail: `${cdnBase}/product-images/dynamic/thumbnail/${product.glt_slug}.webp${versionParam}`,
      zoom: `${cdnBase}/product-images/dynamic/zoom/${product.glt_slug}.webp${versionParam}`,
      enhanced: `${cdnBase}/product-images/dynamic/zoom/${product.glt_slug}.webp${versionParam}`
    };
    
    res.status(200).json({
      success: true,
      product: {
        id: product.id,
        kiotviet_id: product.kiotviet_id,
        name: product.name,
        slug: product.glt_slug,
        image_updated_at: product.glt_image_updated_at,
        images: imageUrls
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
    
    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        success: false,
        message: "tags array is required with at least one tag"
      });
    }
    
    // Check if kiotviet_id exists in kv_products
    const { data: kiotvietProduct, error: kiotvietError } = await supabase
      .from('kv_products')
      .select('*')
      .eq('kiotviet_id', kiotviet_id)
      .single();
    
    if (kiotvietError) {
      return res.status(404).json({
        success: false,
        message: `No KiotViet product found with ID: ${kiotviet_id}`
      });
    }
    
    // Check if product already has GLT fields populated
    if (kiotvietProduct.glt_tags) {
      return res.status(400).json({
        success: false,
        message: `Product with kiotviet_id ${kiotviet_id} already has GLT data in kv_products`
      });
    }
    
    // Update product with GLT fields
    const { data: updatedProduct, error: updateError } = await supabase
      .from('kv_products')
      .update({
        glt_tags: tags,
        glt_note: note,
        glt_visible: visible,
        glt_updated_at: new Date()
      })
      .eq('kiotviet_id', kiotviet_id)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error updating product:', updateError);
      throw updateError;
    }
    
    res.status(201).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct
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
    
    // Get all products with images (glt_image_updated_at is not null)
    const { data: products, error } = await supabase
      .from('kv_products')
      .select('id, kiotviet_id, glt_slug, glt_tags, glt_image_updated_at, glt_sort_order, glt_visible')
      .order('glt_sort_order', { ascending: true, nullsLast: true })
      .order('id', { ascending: true })
      .not('glt_image_updated_at', 'is', null);
    
    if (error) {
      console.error('❌ Error fetching products for manifest:', error);
      throw error;
    }
    
    console.log(`Found ${products?.length || 0} products with images`);
    
    // Build the image manifest
    const manifest = {
      lastUpdated: new Date().toISOString(),
      version: 1,
      totalCount: products?.length || 0,
      images: (products || []).map(product => {
        const cdnBase = process.env.CDN_ENDPOINT || '';
        const versionParam = `?v=${product.glt_image_updated_at}`;
        const slug = product.glt_slug;
        
        const thumbnailUrl = `${cdnBase}/product-images/dynamic/thumbnail/${slug}.webp${versionParam}`;
        const zoomUrl = `${cdnBase}/product-images/dynamic/zoom/${slug}.webp${versionParam}`;
        const enhancedUrl = `${cdnBase}/product-images/dynamic/zoom/${slug}.webp${versionParam}`;
        
        return {
          id: product.id,
          kiotvietId: product.kiotviet_id,
          slug: product.glt_slug,
          tags: product.glt_tags,
          updatedAt: product.glt_image_updated_at,
          visible: product.glt_visible,
          sortOrder: product.glt_sort_order,
          urls: {
            thumbnail: thumbnailUrl,
            zoom: zoomUrl,
            enhanced: enhancedUrl
          }
        };
      }),
      zoomWidth: 1600,
      zoomHeight: 1200
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
        productCount: products?.length || 0
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
    
    // If we reach here, the upload was successful and response has been sent
    // Update the manifest in the background
    try {
      await updateImageManifest();
    } catch (manifestError) {
      console.error("❌ Background manifest update failed:", manifestError);
    }
  } catch (error) {
    // If the upload failed, just pass the error through
    console.error("❌ Error in upload process:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

/**
 * Process an image to create an enhanced version with text overlay, border, and logo
 * @param {string} zoomPath - Path to the source zoom image
 * @param {string} slug - Product slug for file naming
 * @param {number} productId - Product ID for fetching related data
 * @param {number} categoryId - Category ID for fetching category data
 * @param {string} tempDir - Directory for temporary files
 * @returns {Promise<string|null>} - Path to the enhanced S3 key or null on error
 */
async function processEnhancedZoomImage(zoomPath, slug, productId, categoryId, tempDir) {
  console.log(`🎨 Creating enhanced zoom image with category info, logo, and border`);
  const enhancedZoomPath = path.join(tempDir, `${slug}-enhanced-zoom.webp`);
  
  // Get category information for text overlay and styling
  let categoryName = 'Không xác định';
  let borderColor = '#ffb96e'; // Default color
  
  try {
    // First try to lookup by category_id (as stored in kv_products)
    const { data: category } = await supabase
      .from('kv_product_categories')
      .select('category_name, glt_color_border, category_id')
      .eq('category_id', categoryId)
      .single();
      
    if (category) {
      console.log(`✅ Found category: ${category.category_name} with ID ${categoryId}`);
      categoryName = category.category_name || 'Không xác định';
      borderColor = category.glt_color_border || borderColor;
    } else {
      // Try alternate lookup - sometimes the categoryId is stored differently
      console.log(`⚠️ Category with ID ${categoryId} not found in first lookup, trying alternate lookup`);
      
      const { data: altCategory } = await supabase
        .from('kv_product_categories')
        .select('category_name, glt_color_border, category_id')
        .limit(100);
        
      if (altCategory && altCategory.length > 0) {
        console.log(`📋 Found ${altCategory.length} categories to check against`);
        const found = altCategory.find(cat => String(cat.category_id) === String(categoryId));
        
        if (found) {
          console.log(`✅ Found category via alternate lookup: ${found.category_name} with ID ${found.category_id}`);
          categoryName = found.category_name || 'Không xác định';
          borderColor = found.glt_color_border || borderColor;
        } else {
          console.warn(`⚠️ Category with ID ${categoryId} not found in either lookup, using default values`);
        }
      } else {
        console.warn(`⚠️ No categories found in database, using default values`);
      }
    }
  } catch (categoryError) {
    console.error(`❌ Error fetching category: ${categoryError.message}`);
    console.log(`⚠️ Using default category values`);
  }
  
  // Get product details for overlay text
  let orderTemplate = 'Không xác định';
  let basePrice = 'Không xác định';
  let costPrice = 'Không xác định';
  
  try {
    // Get product details
    const { data: productDetails } = await supabase
      .from('kv_products')
      .select('name, base_price, order_template')
      .eq('id', productId)
      .single();
      
    if (productDetails) {
      console.log(`✅ Found product details for ID ${productId}`);
      orderTemplate = productDetails.order_template || orderTemplate;
      
      // Format price for display
      const formatPrice = (price) => {
        return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      };
      
      if (productDetails.base_price) {
        basePrice = formatPrice(productDetails.base_price);
      }
      
      // Get inventory data for pricing
      const { data: inventory } = await supabase
        .from('kv_product_inventories')
        .select('cost')
        .eq('product_id', productId)
        .limit(1)
        .single();
        
      if (inventory && inventory.cost) {
        costPrice = formatPrice(parseInt(inventory.cost) + 2000);
      }
    } else {
      console.warn(`⚠️ Product details for ID ${productId} not found, using default values`);
    }
  } catch (productError) {
    console.error(`❌ Error fetching product details: ${productError.message}`);
    console.log(`⚠️ Using default product values`);
  }
  
  // Format current timestamp in Vietnam locale
  const now = new Date();
  
  // Get day of week in Vietnamese (Thứ)
  const getDayOfWeekVN = (date) => {
    const day = date.getDay();
    // In Vietnam, Sunday is Chủ Nhật, other days are Thứ 2-7
    return day === 0 ? 'CN' : `T${day + 1}`;
  };
  
  // Format date as: T3 - 06/05/2025, 11:45
  const dayOfWeek = getDayOfWeekVN(now);
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  const timestamp = `${dayOfWeek} - ${day}/${month}/${year}, ${hours}:${minutes}`;
  
  // Create text overlay content
  const textOverlay = [
    `Loại: ${categoryName}`,
    `Mô tả: ${orderTemplate}`,
    `Giá: ${basePrice} (lẻ 1kg) | ${costPrice} (lẻ 1b50)`,
    `Thời gian: ${timestamp}`
  ];
  
  console.log(`📝 Text overlay prepared:`, textOverlay);
  
  try {
    // Convert WebP to PNG because canvas doesn't support WebP directly
    const tempPngPath = path.join(tempDir, `${slug}-zoom-temp.png`);
    await sharp(zoomPath)
      .png()
      .toFile(tempPngPath);
    
    console.log(`✅ Converted WebP to PNG for canvas processing: ${tempPngPath}`);
    
    // Get image dimensions
    const image = await sharp(tempPngPath).metadata();
    
    // Create canvas with appropriate dimensions
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Load the image into the canvas
    const zoomedImage = await loadImage(tempPngPath);
    ctx.drawImage(zoomedImage, 0, 0);
    
    // Draw border using category color (10px thickness)
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 20;
    ctx.strokeRect(0, 0, image.width, image.height);
    
    // Load logo
    const logoPath = path.join(__dirname, '../assets/images/logo-main.png');
    
    try {
      const logo = await loadImage(logoPath);

      // Font và đo kích thước text
      ctx.font = '30px "NunitoExtraBold"';
      const textMetrics = textOverlay.map(line => ctx.measureText(line));
      const maxWidth = Math.max(...textMetrics.map(m => m.width));
      
      // Layout text block with adjusted dimensions for 4 lines
      const lineHeight = 30;
      const lineGap = 8; // Slightly reduced line gap to accommodate more lines
      const paddingX = 24;
      const paddingY = 18; // Adjusted padding
      const totalHeight = lineHeight * textOverlay.length + lineGap * (textOverlay.length - 1);
      const blockWidth = maxWidth + paddingX * 2;
      const blockHeight = totalHeight + paddingY * 2;
      
      // Position the block a bit higher to fit all content
      const blockX = 20;
      const blockY = image.height - blockHeight - 40; // Adjusted position
      
      // Nền màu dưới text, bo góc 20px
      const radius = 20;
      ctx.fillStyle = borderColor;
      ctx.beginPath();
      ctx.moveTo(blockX + radius, blockY);
      ctx.lineTo(blockX + blockWidth - radius, blockY);
      ctx.quadraticCurveTo(blockX + blockWidth, blockY, blockX + blockWidth, blockY + radius);
      ctx.lineTo(blockX + blockWidth, blockY + blockHeight - radius);
      ctx.quadraticCurveTo(blockX + blockWidth, blockY + blockHeight, blockX + blockWidth - radius, blockY + blockHeight);
      ctx.lineTo(blockX + radius, blockY + blockHeight);
      ctx.quadraticCurveTo(blockX, blockY + blockHeight, blockX, blockY + blockHeight - radius);
      ctx.lineTo(blockX, blockY + radius);
      ctx.quadraticCurveTo(blockX, blockY, blockX + radius, blockY);
      ctx.closePath();
      ctx.fill();
      
      
      // Text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'white';
      textOverlay.forEach((line, i) => {
        const x = blockX + paddingX;
        const y = blockY + paddingY + i * (lineHeight + lineGap);
        ctx.fillText(line, x, y);
      });
      
      // Logo (đã có sẵn viền trắng từ ảnh PNG)
      const logoSize = 200;
      const logoX = image.width - logoSize - 30;
      const logoY = image.height - logoSize - 30;
      
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      
    } catch (logoError) {
      console.error(`❌ Error loading logo: ${logoError.message}`);
      console.log(`⚠️ Continuing without logo`);
    }
    
    
    
    // Save canvas to temporary PNG file
    const tempEnhancedPath = path.join(tempDir, `${slug}-enhanced-canvas.png`);
    const enhancedBuffer = canvas.toBuffer('image/png');
    fs.writeFileSync(tempEnhancedPath, enhancedBuffer);
    
    // Convert to WebP using sharp
    await sharp(tempEnhancedPath)
      .webp({ quality: 85 })
      .toFile(enhancedZoomPath);
      
    console.log(`✅ Enhanced zoom image created at: ${enhancedZoomPath}`);
    
    // Upload enhanced zoom to S3 (using the same path as regular zoom)
    const enhancedZoomKey = `product-images/dynamic/zoom/${slug}.webp`;
    await uploadToS3(enhancedZoomPath, `${slug}.webp`, enhancedZoomKey);
    
    // Clean up temporary files
    if (fs.existsSync(tempPngPath)) {
      fs.unlinkSync(tempPngPath);
      console.log(`🗑️ Cleaned up temporary PNG file: ${tempPngPath}`);
    }
    if (fs.existsSync(tempEnhancedPath)) {
      fs.unlinkSync(tempEnhancedPath);
      console.log(`🗑️ Cleaned up temporary enhanced PNG file: ${tempEnhancedPath}`);
    }
    if (fs.existsSync(enhancedZoomPath)) {
      fs.unlinkSync(enhancedZoomPath);
      console.log(`🗑️ Cleaned up enhanced zoom WebP file: ${enhancedZoomPath}`);
    }
    
    console.log(`🎉 Enhanced zoom image uploaded to S3: ${enhancedZoomKey}`);
    return enhancedZoomKey;
    
  } catch (error) {
    console.error(`❌ Error in processEnhancedZoomImage: ${error.message}`);
    console.error(error.stack);
    return null;
  }
}

module.exports = {
  handleUpload,
  getProductImages,
  addProductWithTags,
  updateImageManifest,
  handleUploadAndUpdateManifest,
  generateProductSlug,
  getShortPriceString,
  processEnhancedZoomImage
}; 