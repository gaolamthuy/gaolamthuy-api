const sharp = require("sharp");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");
const { registerFonts } = require("../assets/fonts");

// Register all fonts
registerFonts();

const { uploadToS3 } = require("../utils/s3");
const { createClient } = require("@supabase/supabase-js");

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

/**
 * Generate a slug from product name or code
 * @param {Object} product - The product object
 * @returns {string} A slug string
 */
const generateProductSlug = (product) => {
  let baseSlug = "";

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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric chars except spaces and dashes
    .replace(/\s+/g, "-") // Replace spaces with dashes
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .trim();

  // Add kiotviet_id at the end to ensure uniqueness
  return `${slug}-${product.kiotviet_id}`;
};

const getShortPriceString = async (productId) => {
  const { data: inventory } = await supabase
    .from("kv_product_inventories")
    .select("cost")
    .eq("product_id", productId)
    .limit(1)
    .single();

  if (!inventory || !inventory.cost) return null;

  const cost = parseFloat(inventory.cost) + 2000;
  const costShort = (cost / 1000).toFixed(1);

  const { data: product } = await supabase
    .from("kv_products")
    .select("base_price")
    .eq("id", productId)
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
        message: "No file uploaded",
      });
    }

    // Check if kiotviet_id was provided
    const { kiotviet_id, overlayText } = req.body;
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
      .select("*, glt_gallery_thumbnail_title")
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

    // Get product details
    const code = product.code;
    const categoryId = product.category_id;

    // Get thumbnail title from product
    let thumbnailTitle =
      product.glt_gallery_thumbnail_title || overlayText || "";
    console.log(`📝 Debug - Product details retrieved:`, {
      kiotviet_id,
      name: product.name,
      code,
      categoryId,
      hasGltGalleryThumbnailTitle: !!product.glt_gallery_thumbnail_title,
      glt_gallery_thumbnail_title: product.glt_gallery_thumbnail_title,
      hasOverlayText: !!overlayText,
      overlayText,
      finalThumbnailTitle: thumbnailTitle,
    });

    // Get short price text
    const shortPriceText = await getShortPriceString(product.id);
    if (shortPriceText) {
      thumbnailTitle += `\n${shortPriceText}`;
    }
    console.log(
      `📝 Debug - Thumbnail title with short price: "${thumbnailTitle}"`
    );

    // Process image with sharp
    const imagePath = req.file.path;
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
    const resizedThumbnailPath = path.join(
      tempDir,
      `${code}-resized-thumbnail.png`
    );

    // First upload original image to R2
    const originalKey = `product-images/dynamic/original/${code}.${imageInfo.format}`;
    const originalS3Result = await uploadToS3(
      imagePath,
      `${code}.${imageInfo.format}`,
      originalKey
    );
    console.log(`✅ Original image uploaded to R2: ${originalKey}`);

    // First resize the thumbnail image (300x300)
    const resizedBlurredPath = path.join(tempDir, `${code}-resized-blur.png`);
    await sharp(imagePath)
      .resize(300, 300, {
        fit: "cover",
        position: "center",
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
      resizedImageFormat: "PNG",
    });

    // Handle escape sequences in the title text
    if (thumbnailTitle && thumbnailTitle.includes("\\n")) {
      thumbnailTitle = thumbnailTitle.replace(/\\n/g, "\n");
      console.log(
        `📝 Processed escape sequences in title: "${thumbnailTitle}"`
      );
    }

    if (thumbnailTitle) {
      try {
        console.log(
          `🎨 Creating canvas with border color ${borderColor} and text overlay`
        );
        const width = 300;
        const height = 300;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // Load the resized image
        console.log(
          `🖼️ Loading resized image for canvas: ${resizedThumbnailPath}`
        );
        const image = await loadImage(resizedBlurredPath);
        console.log(
          `✅ Image loaded successfully: ${image.width}x${image.height}`
        );

        // Draw a border (5px) using the category color
        ctx.fillStyle = borderColor;
        ctx.fillRect(0, 0, width, height);
        console.log(`🎨 Drew border rectangle with color: ${borderColor}`);

        // Draw the image inside the border
        ctx.drawImage(image, 5, 5, width - 10, height - 10);
        console.log(`🖼️ Drew image inside border`);

        // Add text overlay
        console.log(
          `✏️ Adding text overlay: "${thumbnailTitle.substring(0, 20)}${
            thumbnailTitle.length > 20 ? "..." : ""
          }"`
        );

        // Handle multiline text
        const lines = thumbnailTitle.split("\n");
        console.log(`📝 Split text into ${lines.length} lines:`, lines);

        const lineHeight = 42;
        const baseY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
        console.log(
          `📐 Text positioning - baseY: ${baseY}, lineHeight: ${lineHeight}`
        );

        // // Semi-transparent background for text
        // ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        // ctx.fillRect(5, height - 85, width - 10, 80);
        // console.log(`🎨 Drew semi-transparent background for text`);

        // 2. Nền mờ sau chữ:
        ctx.fillStyle = borderColor;
        // ctx.fillRect(10, height / 2 - (lines.length * 20), width - 20, lines.length * 42);

        // 3. Text settings
        // 5 cases for
        ctx.font =
          lines.length === 1
            ? 'bold 60px "Nunito"' // 1 line
            : lines.length === 2
            ? 'bold 50px "Nunito"' // 2 lines
            : lines.length === 3
            ? 'bold 40px "Nunito"' // 3 lines
            : lines.length === 4
            ? 'bold 40px "Nunito"' // 4 lines
            : 'bold 30px "Nunito"'; // 5 lines
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "white";
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = borderColor;
        ctx.shadowBlur = 3;

        lines.forEach((line, i) => {
          const y = baseY + i * lineHeight;
          ctx.strokeText(line, width / 2, y);
          ctx.fillText(line, width / 2, y);
          console.log(`✏️ Drew line ${i + 1}: "${line}" at y=${y}`);
        });

        // Save the canvas to file (as WebP for final output)
        console.log(`💾 Saving canvas to file: ${thumbnailPath}`);

        // First save as PNG (better canvas compatibility)
        const tempPngPath = path.join(tempDir, `${code}-canvas-output.png`);
        const buffer = canvas.toBuffer("image/png");
        fs.writeFileSync(tempPngPath, buffer);
        console.log(
          `✅ Canvas saved to temporary PNG: ${tempPngPath}, size: ${buffer.length} bytes`
        );

        // Then convert to WebP with sharp
        await sharp(tempPngPath).webp({ quality: 80 }).toFile(thumbnailPath);
        console.log(`✅ Converted canvas output to WebP: ${thumbnailPath}`);

        // Clean up the temporary PNG
        if (fs.existsSync(tempPngPath)) {
          fs.unlinkSync(tempPngPath);
          console.log(`🗑️ Deleted temporary PNG file: ${tempPngPath}`);
        }
      } catch (canvasError) {
        console.error("❌ Error creating canvas:", canvasError);
        console.log("⚠️ Canvas error details:", {
          errorName: canvasError.name,
          errorMessage: canvasError.message,
          errorStack: canvasError.stack,
        });
        console.log("⚠️ Falling back to simple border using sharp");

        // If canvas fails, fall back to simple border with sharp
        await sharp(resizedThumbnailPath)
          .extend({
            top: 5,
            bottom: 5,
            left: 5,
            right: 5,
            background: borderColor,
          })
          .webp({ quality: 80 })
          .toFile(thumbnailPath);

        console.log(
          `✅ Fallback thumbnail created with sharp at ${thumbnailPath}`
        );
      }
    } else {
      console.log(
        `ℹ️ No thumbnail title provided, using simple border without text`
      );
      // If no overlay text, add just the border
      console.log(`🎨 Adding simple border with color ${borderColor}`);
      try {
        await sharp(resizedThumbnailPath)
          .extend({
            top: 5,
            bottom: 5,
            left: 5,
            right: 5,
            background: borderColor,
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
        console.error("❌ Error adding border with sharp:", sharpError);

        // If border extension fails, just use the resized image as is
        console.log("⚠️ Using resized image without border as fallback");
        fs.copyFileSync(resizedThumbnailPath, thumbnailPath);
      }
    }

    // Process zoom version (1200px width, webp format)
    await sharp(imagePath)
      .resize({
        width: 1200,
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toFile(zoomPath);

    // Process enhanced zoom version with text overlay, logo, and border
    if (categoryId) {
      try {
        await processEnhancedZoomImage(
          zoomPath,
          code,
          product.id,
          categoryId,
          tempDir
        );
      } catch (enhancedError) {
        console.error("❌ Error creating enhanced zoom image:", enhancedError);
        console.log("⚠️ Continuing with standard zoom image only");
      }
    }

    // Get thumbnail dimensions and size
    const thumbnailInfo = await sharp(thumbnailPath).metadata();
    const thumbnailStats = fs.statSync(thumbnailPath);

    // Get zoom dimensions and size
    const zoomInfo = await sharp(zoomPath).metadata();
    const zoomStats = fs.statSync(zoomPath);

    console.log(
      `🖼️ Thumbnail: ${thumbnailInfo.width}x${
        thumbnailInfo.height
      }, ${Math.round(thumbnailStats.size / 1024)}KB`
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

    // Update product information
    const { data: updatedProduct, error: updateError } = await supabase
      .from("kv_products")
      .update({
        glt_image_updated_at: imageUpdatedAt,
        glt_updated_at: new Date().toISOString(),
        glt_gallery_original_url: originalS3Result.url || null,
        glt_gallery_thumbnail_url: thumbnailS3Result.url || null,
        glt_gallery_zoom_url: zoomS3Result.url || null,
      })
      .eq("kiotviet_id", kiotviet_id)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Error updating product:", updateError);
      throw updateError;
    }

    // Clean up temporary files
    const filesToClean = [
      imagePath,
      thumbnailPath,
      zoomPath,
      resizedThumbnailPath,
    ];
    for (const file of filesToClean) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`🗑️ Deleted temporary file: ${file}`);
      }
    }

    return res.json({
      success: true,
      message: "Image processed and uploaded successfully",
      data: {
        product: updatedProduct,
        images: {
          original: originalS3Result.url,
          thumbnail: thumbnailS3Result.url,
          zoom: zoomS3Result.url,
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
      thumbnail: `${cdnBase}/product-images/dynamic/thumbnail/${product.glt_slug}.webp${versionParam}`,
      zoom: `${cdnBase}/product-images/dynamic/zoom/${product.glt_slug}.webp${versionParam}`,
      enhanced: `${cdnBase}/product-images/dynamic/zoom/${product.glt_slug}.webp${versionParam}`,
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
 * Add a new product with tags (admin functionality)
 */
const addProductWithTags = async (req, res) => {
  try {
    const { kiotviet_id, tags, note, visible = true } = req.body;

    if (!kiotviet_id) {
      return res.status(400).json({
        success: false,
        message: "kiotviet_id is required",
      });
    }

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        success: false,
        message: "tags array is required with at least one tag",
      });
    }

    // Check if kiotviet_id exists in kv_products
    const { data: kiotvietProduct, error: kiotvietError } = await supabase
      .from("kv_products")
      .select("*")
      .eq("kiotviet_id", kiotviet_id)
      .single();

    if (kiotvietError) {
      return res.status(404).json({
        success: false,
        message: `No KiotViet product found with ID: ${kiotviet_id}`,
      });
    }

    // Check if product already has GLT fields populated
    if (kiotvietProduct.glt_tags) {
      return res.status(400).json({
        success: false,
        message: `Product with kiotviet_id ${kiotviet_id} already has GLT data in kv_products`,
      });
    }

    // Update product with GLT fields
    const { data: updatedProduct, error: updateError } = await supabase
      .from("kv_products")
      .update({
        glt_tags: tags,
        glt_note: note,
        glt_visible: visible,
        glt_updated_at: new Date(),
      })
      .eq("kiotviet_id", kiotviet_id)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Error updating product:", updateError);
      throw updateError;
    }

    res.status(201).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("❌ Error adding product with tags:", error);
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
    console.log("Request received with method:", req?.method);
    console.log(
      "Auth header present:",
      req?.headers?.authorization ? "Yes" : "No"
    );

    // Get all products with images (glt_image_updated_at is not null)
    const { data: products, error } = await supabase
      .from("kv_products")
      .select(
        "id, kiotviet_id, glt_slug, glt_tags, glt_image_updated_at, glt_sort_order, glt_visible"
      )
      .order("glt_sort_order", { ascending: true, nullsLast: true })
      .order("id", { ascending: true })
      .not("glt_image_updated_at", "is", null);

    if (error) {
      console.error("❌ Error fetching products for manifest:", error);
      throw error;
    }

    console.log(`Found ${products?.length || 0} products with images`);

    // Build the image manifest
    const manifest = {
      lastUpdated: new Date().toISOString(),
      version: 1,
      totalCount: products?.length || 0,
      images: (products || []).map((product) => {
        const cdnBase = process.env.CDN_ENDPOINT || "";
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
            enhanced: enhancedUrl,
          },
        };
      }),
      zoomWidth: 1600,
      zoomHeight: 1200,
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

    // Upload to S3 using putObject which our tests confirm works
    const manifestKey = "product-images/manifest.json";
    let manifestUrl = "";

    try {
      console.log(`Uploading manifest to S3...`);
      console.log(`S3 Endpoint: ${process.env.S3_ENDPOINT}`);
      console.log(`S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
      console.log(`S3 Key: ${manifestKey}`);

      // Use the S3 client from our utils
      const { s3 } = require("../utils/s3");

      // Set a shorter timeout for S3 operations
      const AWS = require("aws-sdk");
      AWS.config.httpOptions = { timeout: 15000 };

      console.log("Preparing putObject params...");
      const putParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: manifestKey,
        Body: fs.readFileSync(manifestPath),
        ContentType: "application/json",
        CacheControl: "max-age=60",
      };

      console.log("Executing putObject...");
      const putResult = await s3.putObject(putParams).promise();

      console.log("Upload completed successfully");
      console.log(`Upload result:`, JSON.stringify(putResult));
      console.log(
        `Manifest uploaded to S3 bucket: ${process.env.S3_BUCKET_NAME}, key: ${manifestKey}`
      );

      // Create manifest URL only after successful upload
      manifestUrl = process.env.CDN_ENDPOINT
        ? `${process.env.CDN_ENDPOINT}/${manifestKey}?v=${Date.now()}`
        : `${process.env.S3_ENDPOINT}/${
            process.env.S3_BUCKET_NAME
          }/${manifestKey}?v=${Date.now()}`;

      console.log(`✅ Image manifest updated at: ${manifestUrl}`);
    } catch (uploadError) {
      console.error("❌ Error uploading manifest to S3:", uploadError);

      // Log more details about the error
      console.error("Error details:", uploadError.message);
      console.error("Error stack:", uploadError.stack);
      if (uploadError.code) {
        console.error("Error code:", uploadError.code);
      }
      if (uploadError.statusCode) {
        console.error("Status code:", uploadError.statusCode);
      }
      if (uploadError.region) {
        console.error("Region:", uploadError.region);
      }

      // Print S3 config for debugging (excluding secrets)
      console.log("S3 Configuration:");
      console.log(`  Endpoint: ${process.env.S3_ENDPOINT}`);
      console.log(`  Bucket: ${process.env.S3_BUCKET_NAME}`);
      console.log(`  Region: ${process.env.S3_REGION || "auto"}`);
      console.log(
        `  Access Key ID: ${process.env.S3_ACCESS_KEY ? "******" : "Not set"}`
      );

      // Clean up before throwing error
      try {
        if (fs.existsSync(manifestPath)) {
          fs.unlinkSync(manifestPath);
        }
      } catch (cleanupError) {
        console.error("Error during cleanup:", cleanupError);
      }

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
      console.log("Sending success response");
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
      console.log("Sending error response");
      return res.status(500).json({
        success: false,
        error: error.message,
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
 * Process enhanced zoom image with text overlay, logo, and border
 * @param {string} zoomPath - Path to the zoom image
 * @param {string} code - Product code
 * @param {number} productId - Product ID
 * @param {number} categoryId - Category ID
 * @param {string} tempDir - Temporary directory path
 */
async function processEnhancedZoomImage(
  zoomPath,
  code,
  productId,
  categoryId,
  tempDir
) {
  try {
    // Get category color border if available
    let borderColor = "#ffb96e"; // Default color
    let categoryName = "Không xác định";

    // Get category details
    const { data: category } = await supabase
      .from("kv_product_categories")
      .select("category_name, glt_color_border")
      .eq("category_id", categoryId)
      .single();

    if (category) {
      categoryName = category.category_name || categoryName;
      borderColor = category.glt_color_border || borderColor;
    }

    // Create enhanced zoom image path
    const enhancedZoomPath = path.join(tempDir, `${code}-enhanced-zoom.webp`);

    // Process the enhanced zoom image
    await sharp(zoomPath)
      .resize(1200, null, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(enhancedZoomPath);

    // Upload enhanced zoom version to S3
    const enhancedZoomKey = `product-images/dynamic/zoom/${code}-enhanced.webp`;
    await uploadToS3(
      enhancedZoomPath,
      `${code}-enhanced.webp`,
      enhancedZoomKey
    );

    // Clean up temporary file
    if (fs.existsSync(enhancedZoomPath)) {
      fs.unlinkSync(enhancedZoomPath);
    }

    return enhancedZoomPath;
  } catch (error) {
    console.error("Error in processEnhancedZoomImage:", error);
    throw error;
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
  processEnhancedZoomImage,
};
