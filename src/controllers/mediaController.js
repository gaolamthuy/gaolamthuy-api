const sharp = require("sharp");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");
const { registerFonts } = require("../assets/fonts");
const { uploadToS3 } = require("../utils/s3");
const { createClient } = require("@supabase/supabase-js");
const puppeteer = require("puppeteer");
const priceTableService = require("../services/priceTableService");

// Register all fonts for canvas
registerFonts();

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Removed unused functions: generateProductSlug and getShortPriceString

/**
 * Handle media uploads and apply image processing
 */
const handleUpload = async (req, res) => {
  try {
    // Check if a file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Check if kiotviet_id was provided
    const { kiotviet_id } = req.body;
    if (!kiotviet_id) {
      return res.status(400).json({
        success: false,
        message: "kiotviet_id is required to identify the product",
      });
    }

    console.log(`🔍 Searching for product with kiotviet_id: ${kiotviet_id}`);

    // Find product by kiotviet_id
    const { data: product, error: searchError } = await supabase
      .from("kv_products")
      .select("*")
      .eq("kiotviet_id", kiotviet_id)
      .single();

    if (searchError) {
      console.error(
        "❌ Error searching for product by kiotviet_id:",
        searchError
      );
      throw searchError;
    }

    // Check if we found the product
    if (!product) {
      return res.status(404).json({
        success: false,
        message: `No product found with kiotviet_id: ${kiotviet_id}`,
      });
    }

    // Process the image and upload
    const result = await processAndUploadImages(product, req.file);

    // Update manifest in the background
    try {
      updateImageManifest().catch((err) => {
        console.error("❌ Background manifest update failed:", err);
      });
    } catch (manifestError) {
      console.error("❌ Background manifest update failed:", manifestError);
    }

    return res.json({
      success: true,
      message: "Image processed and uploaded successfully",
      data: {
        product: result.updatedProduct,
        images: {
          original: result.originalUrl,
          thumbnail: result.thumbnailUrl,
          zoom: result.zoomUrl,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error in handleUpload:", error);
    return res.status(500).json({
      success: false,
      message: "Error processing image",
      error: error.message,
    });
  }
};

/**
 * Process and upload product images
 * @param {Object} product - Product object from database
 * @param {Object} fileInfo - Uploaded file information
 * @returns {Object} - Updated product and image URLs
 */
const processAndUploadImages = async (product, fileInfo) => {
  // Get product details
  const code = product.code;
  const categoryId = product.category_id;

  // Process image with sharp
  const imagePath = fileInfo.path;
  const imageInfo = await sharp(imagePath).metadata();

  console.log(
    `🖼️ Original image dimensions: ${imageInfo.width} x ${imageInfo.height}, format: ${imageInfo.format}`
  );

  // Generate new timestamp for image_updated_at
  const imageUpdatedAt = Date.now();

  // Create temporary directories for processed images
  const tempDir = path.join(__dirname, "../../uploads/temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Define paths for processed images
  const thumbnailPath = path.join(tempDir, `${code}-thumbnail.webp`);
  const zoomPath = path.join(tempDir, `${code}-zoom.webp`);

  // First upload original image to R2
  const originalKey = `product-images/dynamic/original/${code}.${imageInfo.format}`;
  const originalS3Result = await uploadToS3(
    imagePath,
    `${code}.${imageInfo.format}`,
    originalKey
  );
  console.log(`✅ Original image uploaded to R2: ${originalKey}`);

  // Create simple thumbnail (300x300) using just sharp resizing
  await sharp(imagePath)
    .resize(300, 300, {
      fit: "cover",
      position: "center",
    })
    .webp({ quality: 80 })
    .toFile(thumbnailPath);

  console.log(`✅ Thumbnail created at ${thumbnailPath}`);

  // Process zoom version with text overlay using canvas
  await processZoomImage(imagePath, zoomPath, product);

  // Get thumbnail dimensions and size
  const thumbnailInfo = await sharp(thumbnailPath).metadata();
  const thumbnailStats = fs.statSync(thumbnailPath);

  // Get zoom dimensions and size
  const zoomInfo = await sharp(zoomPath).metadata();
  const zoomStats = fs.statSync(zoomPath);

  console.log(
    `🖼️ Thumbnail: ${thumbnailInfo.width}x${thumbnailInfo.height}, ${Math.round(
      thumbnailStats.size / 1024
    )}KB`
  );
  console.log(
    `🖼️ Zoom: ${zoomInfo.width}x${zoomInfo.height}, ${Math.round(
      zoomStats.size / 1024
    )}KB`
  );

  // Upload thumbnail to S3
  const thumbnailKey = `product-images/dynamic/thumbnail/${code}.webp`;
  const thumbnailS3Result = await uploadToS3(
    thumbnailPath,
    `${code}.webp`,
    thumbnailKey
  );

  // Upload zoom version to S3
  const zoomKey = `product-images/dynamic/zoom/${code}.webp`;
  const zoomS3Result = await uploadToS3(zoomPath, `${code}.webp`, zoomKey);

  // Update the product slug if not already set
  let slug = product.glt_slug;
  if (!slug) {
    slug = generateProductSlug(product);
  }

  // Update product information
  const { data: updatedProduct, error: updateError } = await supabase
    .from("kv_products")
    .update({
      glt_image_updated_at: imageUpdatedAt,
      glt_updated_at: new Date().toISOString(),
      glt_gallery_original_url: originalS3Result.url || null,
      glt_gallery_thumbnail_url: thumbnailS3Result.url || null,
      glt_gallery_zoom_url: zoomS3Result.url || null,
      glt_slug: slug,
    })
    .eq("kiotviet_id", product.kiotviet_id)
    .select()
    .single();

  if (updateError) {
    console.error("❌ Error updating product:", updateError);
    throw updateError;
  }

  // Clean up temporary files
  const filesToClean = [imagePath, thumbnailPath, zoomPath];
  for (const file of filesToClean) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`🗑️ Deleted temporary file: ${file}`);
    }
  }

  return {
    updatedProduct,
    originalUrl: originalS3Result.url,
    thumbnailUrl: thumbnailS3Result.url,
    zoomUrl: zoomS3Result.url,
  };
};

/**
 * Process zoom image with text overlay
 * @param {string} sourcePath - Path to the source image
 * @param {string} outputPath - Path to save the processed image
 * @param {Object} product - Product object
 */
const processZoomImage = async (sourcePath, outputPath, product) => {
  try {
    // Get directory and base name for temp files
    const tempPngPath = outputPath.replace(".webp", "-temp.png");

    // First resize the image to PNG (not WebP) for canvas compatibility
    await sharp(sourcePath)
      .resize({
        width: 1600,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png() // Use PNG for canvas compatibility
      .toFile(tempPngPath);

    console.log(
      `✅ Created temporary PNG for canvas processing: ${tempPngPath}`
    );

    // Get category color and product details from the database
    let borderColor = "#ffb96e"; // Default color
    let categoryName = "Chưa phân loại";
    let modifiedDate = new Date().toLocaleDateString("vi-VN");
    let basePrice = 0;
    let wholeP10Price = 0;
    let description = "";

    // Fetch complete product info from view_product
    const { data: productDetails } = await supabase
      .from("view_product")
      .select("*")
      .eq("kiotviet_id", product.kiotviet_id)
      .single();

    if (productDetails) {
      categoryName = productDetails.category_name || categoryName;
      borderColor = productDetails.glt_color_border || borderColor;
      modifiedDate = productDetails.modified_date
        ? new Date(productDetails.modified_date)
        : new Date();
      basePrice = productDetails.base_price || 0;
      wholeP10Price = productDetails.whole_p10_price || 0;
      description = productDetails.description || "";
    } else if (product.category_id) {
      // Fallback if we can't get from view_product but have category_id
      const { data: category } = await supabase
        .from("kv_product_categories")
        .select("category_name, glt_color_border")
        .eq("category_id", product.category_id)
        .single();

      if (category) {
        categoryName = category.category_name || categoryName;
        borderColor = category.glt_color_border || borderColor;
      }
    }

    // Create canvas with the image dimensions
    const imageInfo = await sharp(tempPngPath).metadata();
    const canvas = createCanvas(imageInfo.width, imageInfo.height);
    const ctx = canvas.getContext("2d");

    console.log(
      `🎨 Canvas created with dimensions: ${imageInfo.width}x${imageInfo.height}`
    );

    // Load the PNG image onto the canvas
    try {
      const image = await loadImage(tempPngPath);
      ctx.drawImage(image, 0, 0, imageInfo.width, imageInfo.height);
      console.log(`✅ Image successfully loaded onto canvas`);
    } catch (loadError) {
      console.error(`❌ Error loading image onto canvas:`, loadError);
      throw loadError;
    }

    // Format dates with dd/mm/yyyy - HH:mm format
    const formatDate = (date) => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");

      return `${day}/${month}/${year} - ${hours}:${minutes}`;
    };

    const modifiedDateFormatted = formatDate(modifiedDate);
    const imageUpdatedDate = product.glt_image_updated_at
      ? formatDate(new Date(parseInt(product.glt_image_updated_at)))
      : formatDate(new Date());

    // Format currency
    const formatCurrency = (value) => {
      return new Intl.NumberFormat("vi-VN").format(value);
    };

    // Add light gray semi-transparent background at the bottom
    const bottomBgHeight = 170;
    // Use light gray background with transparency
    ctx.fillStyle = "rgba(240, 240, 240, 0.85)"; // Light gray with 85% opacity
    ctx.fillRect(
      0,
      imageInfo.height - bottomBgHeight,
      imageInfo.width,
      bottomBgHeight
    );

    // Add logo at bottom left
    try {
      const logoPath = path.join(__dirname, "../assets/images/logo-main.png");
      const logo = await loadImage(logoPath);
      const logoSize = 140;
      const logoMargin = 15;
      ctx.drawImage(
        logo,
        logoMargin,
        imageInfo.height - logoSize - logoMargin,
        logoSize,
        logoSize
      );
      console.log(`✅ Added logo to canvas`);
    } catch (logoError) {
      console.error(`❌ Error adding logo:`, logoError);
      // Continue without logo
    }

    // Add product details at bottom right
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    // Calculate positions
    const rightMargin = 30;
    const textStartY = imageInfo.height - bottomBgHeight + 30;

    // Main text (category - description)
    ctx.font = 'bold 30px "Nunito"';
    ctx.fillStyle = borderColor; // Use category color for text
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 2;

    // If description is too long, truncate it
    const maxDescLength = 35;
    const truncatedDesc =
      description.length > maxDescLength
        ? description.substring(0, maxDescLength) + "..."
        : description;

    const titleText = `${categoryName} - ${truncatedDesc}`;
    ctx.fillText(titleText, imageInfo.width - rightMargin, textStartY);

    // Price line
    ctx.font = 'bold 32px "Nunito"';
    const priceText = `lẻ ${formatCurrency(basePrice)} | sỉ ${formatCurrency(
      wholeP10Price
    )}`;
    ctx.fillText(priceText, imageInfo.width - rightMargin, textStartY + 45);

    // Update timestamps (smaller text)
    ctx.font = '18px "Nunito"';
    ctx.fillText(
      `cập nhật thông tin: ${modifiedDateFormatted}`,
      imageInfo.width - rightMargin,
      textStartY + 90
    );

    ctx.fillText(
      `cập nhật hình ảnh: ${imageUpdatedDate}`,
      imageInfo.width - rightMargin,
      textStartY + 120
    );

    console.log(`✅ Added detailed text overlay to canvas`);

    // Save the canvas output to another temp PNG file
    const canvasOutputPath = tempPngPath.replace("-temp.png", "-canvas.png");
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(canvasOutputPath, buffer);
    console.log(`✅ Canvas saved to ${canvasOutputPath}`);

    // Convert to WebP with sharp for final output
    await sharp(canvasOutputPath).webp({ quality: 85 }).toFile(outputPath);
    console.log(`✅ Converted canvas output to WebP at ${outputPath}`);

    // Clean up the temporary files
    const tempFiles = [tempPngPath, canvasOutputPath];
    for (const file of tempFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`🗑️ Deleted temporary file: ${file}`);
      }
    }

    console.log(`✅ Zoom image processed with text overlay: ${outputPath}`);
  } catch (error) {
    console.error("❌ Error processing zoom image:", error);
    console.log("⚠️ Falling back to standard resized image");

    // Create a standard WebP image without canvas processing
    try {
      await sharp(sourcePath)
        .resize({
          width: 1600,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toFile(outputPath);
      console.log(`✅ Created fallback zoom image at ${outputPath}`);
    } catch (fallbackError) {
      console.error("❌ Error creating fallback zoom image:", fallbackError);
    }

    // Clean up any temporary files that might exist
    const tempPngPath = outputPath.replace(".webp", "-temp.png");
    const canvasOutputPath = tempPngPath.replace("-temp.png", "-canvas.png");
    [tempPngPath, canvasOutputPath].forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  }
};

/**
 * Reprocess images for a product after webhook update
 * @param {number} kiotvietId - KiotViet product ID
 */
const reprocessProductImages = async (kiotvietId) => {
  try {
    console.log(
      `🔄 Reprocessing images for product with KiotViet ID: ${kiotvietId}`
    );

    // Find product in database
    const { data: product, error: productError } = await supabase
      .from("kv_products")
      .select("*")
      .eq("kiotviet_id", kiotvietId)
      .single();

    if (productError || !product) {
      console.error(
        `❌ Product with KiotViet ID ${kiotvietId} not found:`,
        productError?.message || "Not found"
      );
      return;
    }

    // Check if product has an original image
    if (!product.glt_gallery_original_url) {
      console.log(
        `ℹ️ Product with KiotViet ID ${kiotvietId} has no original image to reprocess`
      );
      return;
    }

    // Download the original image
    const originalUrl = product.glt_gallery_original_url;
    const tempDir = path.join(__dirname, "../../uploads/temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempOriginalPath = path.join(
      tempDir,
      `${product.code}-original-temp.jpg`
    );

    // Using node-fetch to download the image
    const fetch = require("node-fetch");
    const response = await fetch(originalUrl);
    const buffer = await response.buffer();
    fs.writeFileSync(tempOriginalPath, buffer);

    console.log(`✅ Original image downloaded to ${tempOriginalPath}`);

    // Process thumbnail and zoom images
    const thumbnailPath = path.join(tempDir, `${product.code}-thumbnail.webp`);
    const zoomPath = path.join(tempDir, `${product.code}-zoom.webp`);

    // Create simple thumbnail (300x300)
    await sharp(tempOriginalPath)
      .resize(300, 300, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 80 })
      .toFile(thumbnailPath);

    console.log(`✅ Thumbnail created at ${thumbnailPath}`);

    // Process zoom version with text overlay
    await processZoomImage(tempOriginalPath, zoomPath, product);

    // Upload thumbnail to S3
    const thumbnailKey = `product-images/dynamic/thumbnail/${product.code}.webp`;
    const thumbnailS3Result = await uploadToS3(
      thumbnailPath,
      `${product.code}.webp`,
      thumbnailKey
    );

    // Upload zoom version to S3
    const zoomKey = `product-images/dynamic/zoom/${product.code}.webp`;
    const zoomS3Result = await uploadToS3(
      zoomPath,
      `${product.code}.webp`,
      zoomKey
    );

    // Update product with new image timestamp
    const imageUpdatedAt = Date.now();
    const { error: updateError } = await supabase
      .from("kv_products")
      .update({
        glt_image_updated_at: imageUpdatedAt,
        glt_gallery_thumbnail_url: thumbnailS3Result.url || null,
        glt_gallery_zoom_url: zoomS3Result.url || null,
      })
      .eq("kiotviet_id", kiotvietId);

    if (updateError) {
      console.error(`❌ Error updating product images:`, updateError.message);
    } else {
      console.log(
        `✅ Product images reprocessed successfully for KiotViet ID: ${kiotvietId}`
      );
    }

    // Clean up temporary files
    const filesToClean = [tempOriginalPath, thumbnailPath, zoomPath];
    for (const file of filesToClean) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }

    // Update manifest in the background
    updateImageManifest().catch((err) => {
      console.error("❌ Background manifest update failed:", err);
    });

    return true;
  } catch (error) {
    console.error(`❌ Error reprocessing product images:`, error);
    return false;
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
        message: "kiotviet_id parameter is required",
      });
    }

    // Get product from database
    const { data: product, error } = await supabase
      .from("kv_products")
      .select("*, glt_slug, glt_image_updated_at")
      .eq("kiotviet_id", kiotviet_id)
      .single();

    if (error) {
      console.error("❌ Error fetching product:", error);
      return res.status(404).json({
        success: false,
        message: `No product found with KiotViet ID: ${kiotviet_id}`,
        error: error.message,
      });
    }

    // Check if product has images
    if (!product.glt_slug || !product.glt_image_updated_at) {
      return res.status(404).json({
        success: false,
        message: `No images found for product with KiotViet ID: ${kiotviet_id}`,
      });
    }

    // Build image URLs with cache-busting version parameter
    const cdnBase = process.env.CDN_ENDPOINT || "";
    const versionParam = `?v=${product.glt_image_updated_at}`;

    const imageUrls = {
      original: `${cdnBase}/product-images/dynamic/original/${product.glt_slug}.jpg${versionParam}`,
      thumbnail: `${cdnBase}/product-images/dynamic/thumbnail/${product.glt_slug}.webp${versionParam}`,
      zoom: `${cdnBase}/product-images/dynamic/zoom/${product.glt_slug}.webp${versionParam}`,
    };

    res.status(200).json({
      success: true,
      product: {
        id: product.id,
        kiotviet_id: product.kiotviet_id,
        name: product.name,
        slug: product.glt_slug,
        image_updated_at: product.glt_image_updated_at,
        images: imageUrls,
      },
    });
  } catch (error) {
    console.error("❌ Error getting product images:", error);
    res.status(500).json({
      success: false,
      error: error.message,
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
      console.log("⚠️ Operation timed out after", TIMEOUT_MS, "ms");
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Operation timed out",
          message: "The manifest generation took too long and timed out",
        });
      }
    }, TIMEOUT_MS);
  }

  try {
    console.log("Starting image manifest generation...");

    // Get all products from the view_product view
    const { data: products, error } = await supabase
      .from("view_product")
      .select("*")
      .order("category_rank", { ascending: true })
      .order("cost", { ascending: true });

    if (error) {
      console.error("❌ Error fetching products from view_product:", error);
      throw error;
    }

    console.log(`Found ${products?.length || 0} products in view_product`);

    // Build the image manifest with the new structure (version 2)
    const manifest = {
      version: 2,
      lastUpdated: new Date().toISOString(),
      imageConfig: {
        thumbnail: { width: 300, height: 300 },
        zoom: { width: 1600, height: 1200 },
      },
      totalCount: products?.length || 0,
      products: (products || [])
        .map((product) => {
          const cdnBase = process.env.CDN_ENDPOINT || "";
          const versionParam = product.glt_image_updated_at
            ? `?v=${product.glt_image_updated_at}`
            : "";
          const slug = product.glt_slug || "";

          // Only include image data if the product has images
          const imageData = product.glt_image_updated_at
            ? {
                updatedAt: product.glt_image_updated_at,
                visible: product.glt_visible || false,
                sortOrder: product.glt_sort_order || null,
                urls: {
                  original:
                    product.glt_gallery_original_url ||
                    `${cdnBase}/product-images/dynamic/original/${slug}.jpg`,
                  thumbnail:
                    product.glt_gallery_thumbnail_url ||
                    `${cdnBase}/product-images/dynamic/thumbnail/${slug}.webp${versionParam}`,
                  zoom:
                    product.glt_gallery_zoom_url ||
                    `${cdnBase}/product-images/dynamic/zoom/${slug}.webp${versionParam}`,
                },
              }
            : null;

          return {
            kiotvietId: product.kiotviet_id,
            slug: slug,
            fullName: product.full_name || "",
            code: product.code || "",
            unit: product.unit || "kg",
            category: {
              name: product.category_name || "",
              rank: product.category_rank || 0,
              color: product.glt_color_border || "#cccccc",
              id: product.category_id || null,
              parentId: product.parent_category_id || null,
              parentName: product.parent_category_name || null,
            },
            basePrice: product.base_price || 0,
            cost: product.cost || 0,
            wholeP10Price: product.whole_p10_price || 0,
            description: product.description || "",
            barcode: product.barcode || "",
            tags: product.tags || [],
            attributes: product.attributes || {},
            inventoryTracking: product.inventory_tracking || false,
            modifiedDate: product.modified_date || new Date().toISOString(),
            createdDate: product.created_date || null,
            isActive: product.is_active !== false,
            image: imageData,
            customFields: {
              gltVisible: product.glt_visible || false,
              gltSortOrder: product.glt_sort_order || null,
              gltFeatured: product.glt_featured || false,
              gltNotes: product.glt_notes || "",
              wholesaleEligible: product.wholesale_eligible || false,
              productType: product.product_type || "standard",
            },
          };
        })
        .filter((product) => product.slug), // Only include products with a slug
    };

    // Save manifest to a temp file
    const tempDir = path.join(__dirname, "../../uploads/temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const manifestPath = path.join(tempDir, "product-images-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`Manifest file created at ${manifestPath}`);
    console.log(`File size: ${fs.statSync(manifestPath).size} bytes`);

    // Upload to S3
    const manifestKey = "product-images/manifest.json";
    let manifestUrl = "";

    try {
      console.log(`Uploading manifest to S3...`);

      // Use the S3 client from our utils
      const { s3 } = require("../utils/s3");

      // Set a shorter timeout for S3 operations
      const AWS = require("aws-sdk");
      AWS.config.httpOptions = { timeout: 15000 };

      const putParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: manifestKey,
        Body: fs.readFileSync(manifestPath),
        ContentType: "application/json",
        CacheControl: "max-age=60",
      };

      const putResult = await s3.putObject(putParams).promise();

      // Create manifest URL only after successful upload
      manifestUrl = process.env.CDN_ENDPOINT
        ? `${process.env.CDN_ENDPOINT}/${manifestKey}?v=${Date.now()}`
        : `${process.env.S3_ENDPOINT}/${
            process.env.S3_BUCKET_NAME
          }/${manifestKey}?v=${Date.now()}`;

      console.log(`✅ Image manifest updated at: ${manifestUrl}`);
    } catch (uploadError) {
      console.error("❌ Error uploading manifest to S3:", uploadError);

      // Throw the error but first check if we need to respond
      if (res && !res.headersSent) {
        clearTimeout(timeoutId);
        return res.status(500).json({
          success: false,
          error: "S3 upload failed",
          details: uploadError.message,
          code: uploadError.code,
        });
      }

      throw uploadError;
    }

    // Clean up temp file
    try {
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
        console.log("Temporary file deleted");
      }
    } catch (cleanupError) {
      console.error("Error cleaning up:", cleanupError);
    }

    // Clear timeout and send response if needed
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (res && !res.headersSent) {
      return res.status(200).json({
        success: true,
        message: "Image manifest updated successfully",
        url: manifestUrl,
        productCount: products?.length || 0,
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
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    throw error;
  }
};

/**
 * Generate price table images for all active categories (HTTP endpoint)
 * This controller wraps the core service function for HTTP requests
 */
async function generatePriceTableImages(req, res) {
  try {
    const result = await priceTableService.generatePriceTableImagesCore();

    // Update manifest in the background if generation was successful
    if (result.success && !result.skipped) {
      updateImageManifest().catch((err) => {
        console.error(
          "❌ Background manifest update failed after price table generation:",
          err
        );
      });
    }

    // Determine HTTP status code based on result
    let statusCode = 200;
    if (result.skipped) {
      statusCode = 409; // Conflict - already in progress
    } else if (!result.success) {
      statusCode = 500;
    }

    return res.status(statusCode).json(result);
  } catch (error) {
    console.error(
      "❌ Error in generatePriceTableImages HTTP endpoint:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: "Error generating price table images",
      error: error.message,
    });
  }
}

/**
 * Generate retail price table images for all active categories
 * Uses the card-style layout (/print/price-table/retail?background=true&category=${categoryId})
 */
async function generateRetailPriceTableImages(req, res) {
  try {
    const result = await priceTableService.generateRetailPriceTableImagesCore();

    // Update manifest in the background if generation was successful
    if (result.success && !result.skipped) {
      updateImageManifest().catch((err) => {
        console.error(
          "❌ Background manifest update failed after retail price table generation:",
          err
        );
      });
    }

    // Determine HTTP status code based on result
    let statusCode = 200;
    if (result.skipped) {
      statusCode = 409; // Conflict - already in progress
    } else if (!result.success) {
      statusCode = 500;
    }

    return res.status(statusCode).json(result);
  } catch (error) {
    console.error(
      "❌ Error in generateRetailPriceTableImages HTTP endpoint:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: "Error generating retail price table images",
      error: error.message,
    });
  }
}

/**
 * Generate wholesale price table images
 * Uses the clean layout (/print/price-table/whole) to capture full page
 */
async function generateWholesalePriceTableImages(req, res) {
  try {
    const result =
      await priceTableService.generateWholesalePriceTableImagesCore();

    // Update manifest in the background if generation was successful
    if (result.success && !result.skipped) {
      updateImageManifest().catch((err) => {
        console.error(
          "❌ Background manifest update failed after wholesale price table generation:",
          err
        );
      });
    }

    // Determine HTTP status code based on result
    let statusCode = 200;
    if (result.skipped) {
      statusCode = 409; // Conflict - already in progress
    } else if (!result.success) {
      statusCode = 500;
    }

    return res.status(statusCode).json(result);
  } catch (error) {
    console.error(
      "❌ Error in generateWholesalePriceTableImages HTTP endpoint:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: "Error generating wholesale price table images",
      error: error.message,
    });
  }
}

module.exports = {
  handleUpload,
  getProductImages,
  updateImageManifest,
  reprocessProductImages,
  processAndUploadImages,
  generatePriceTableImages,
  generateRetailPriceTableImages,
  generateWholesalePriceTableImages,
};
