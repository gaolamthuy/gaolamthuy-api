const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const s3 = require('./s3');

/**
 * Upload a file to S3/R2 storage
 * @param {string} filePath - Local path to the file
 * @param {string} originalFilename - Original filename
 * @param {string} [customS3Key] - Custom S3 key to use, or productId for backwards compatibility
 * @returns {Promise<Object>} - URL and metadata of the uploaded file
 */
const uploadToS3 = async (filePath, originalFilename, customS3Key = null) => {
  try {
    const fileContent = fs.readFileSync(filePath);
    const fileExt = path.extname(originalFilename);
    
    let s3Key;
    
    // Check if customS3Key is a full path or just a product ID
    if (customS3Key && customS3Key.includes('/')) {
      // It's a full S3 key path
      s3Key = customS3Key;
    } else {
      // Generate a unique filename or use product ID if provided
      const timestamp = Date.now();
      const fileName = customS3Key 
        ? `product-${customS3Key}${fileExt}` 
        : `${path.basename(filePath)}`;
      
      // Create the S3 key with product-images/dynamic/ prefix
      s3Key = `product-images/dynamic/${fileName}`;
    }
    
    // For cache busting
    const timestamp = Date.now();
    
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: `image/${fileExt.substring(1)}`, // Remove the dot from extension
    };
    
    // Upload to S3/R2
    const uploadResult = await s3.upload(params).promise();
    console.log(`✅ File uploaded successfully to ${uploadResult.Location}`);
    
    // Get image dimensions
    const imageInfo = await getImageDimensions(filePath);
    
    // Generate URL with timestamp for cache busting if no CDN_ENDPOINT
    const cdnUrl = process.env.CDN_ENDPOINT 
      ? `${process.env.CDN_ENDPOINT}/${s3Key}?v=${timestamp}` 
      : `${uploadResult.Location}?v=${timestamp}`;
    
    return {
      url: cdnUrl,
      key: s3Key,
      dimensions: imageInfo,
      timestamp
    };
  } catch (error) {
    console.error(`❌ Error uploading file to S3/R2: ${error.message}`);
    throw error;
  }
};

/**
 * List all files in the bucket with the given prefix
 * @param {string} prefix - Prefix to filter objects (default: product-images/dynamic/)
 * @returns {Promise<Array>} - Array of objects in the bucket
 */
const listS3Files = async (prefix = 'product-images/dynamic/') => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: prefix
    };
    
    const data = await s3.listObjectsV2(params).promise();
    console.log(`✅ Listed ${data.Contents.length} files in ${params.Bucket}/${prefix}`);
    
    return data.Contents.map(item => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      url: process.env.CDN_ENDPOINT 
        ? `${process.env.CDN_ENDPOINT}/${item.Key}` 
        : `${process.env.S3_ENDPOINT.replace(process.env.S3_BUCKET_NAME, '')}${process.env.S3_BUCKET_NAME}/${item.Key}`
    }));
  } catch (error) {
    console.error(`❌ Error listing files from S3/R2: ${error.message}`);
    throw error;
  }
};

/**
 * Get image dimensions using Sharp
 * @param {string} filePath - Path to the image file
 * @returns {Promise<Object>} - Width and height of the image
 */
const getImageDimensions = async (filePath) => {
  try {
    const sharp = require('sharp');
    const metadata = await sharp(filePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height
    };
  } catch (error) {
    console.error(`❌ Error getting image dimensions: ${error.message}`);
    return { width: 0, height: 0 };
  }
};

module.exports = {
  uploadToS3,
  listS3Files
}; 