/**
 * Storage Utilities
 * 
 * This module provides functions for interacting with S3/R2 storage.
 */

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

// Configure AWS S3 client
const s3 = new AWS.S3({
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: process.env.S3_REGION,
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

/**
 * Upload a file to S3/R2 storage
 * @param {string} filePath - Path to the local file
 * @param {string} fileName - Name to use for the file in S3
 * @param {string} key - S3 key (path)
 * @returns {Promise<Object>} Upload result with URL
 */
async function uploadToS3(filePath, fileName, key) {
  try {
    // Prepare upload parameters
    const fileContent = fs.readFileSync(filePath);
    const contentType = fileName.endsWith('.webp') ? 'image/webp' : 
                        fileName.endsWith('.png') ? 'image/png' :
                        fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' :
                        fileName.endsWith('.json') ? 'application/json' : 
                        'application/octet-stream';
    
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      ACL: 'public-read'
    };
    
    // Upload to S3
    const result = await s3.upload(params).promise();
    
    console.log(`✅ File uploaded successfully to ${result.Location}`);
    
    // Construct URL
    const url = process.env.CDN_ENDPOINT 
      ? `${process.env.CDN_ENDPOINT}/${key}` 
      : result.Location;
    
    return {
      success: true,
      key,
      url,
      originalResult: result
    };
  } catch (error) {
    console.error(`❌ Error uploading file to S3: ${error.message}`);
    throw error;
  }
}

/**
 * Create and upload a JSON manifest to S3/R2
 * @param {Object} manifestData - The manifest data to upload
 * @param {string} key - S3 key for the manifest
 * @returns {Promise<Object>} Upload result with URL
 */
async function uploadJsonManifest(manifestData, key = 'product-images/manifest.json') {
  try {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Save manifest to temp file
    const manifestPath = path.join(tempDir, 'temp-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
    
    console.log(`Manifest file created at ${manifestPath}`);
    console.log(`File size: ${fs.statSync(manifestPath).size} bytes`);
    
    // Upload to S3
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: fs.readFileSync(manifestPath),
      ContentType: 'application/json',
      CacheControl: 'max-age=60',
      ACL: 'public-read'
    };
    
    const result = await s3.putObject(params).promise();
    
    // Construct URL
    const manifestUrl = process.env.CDN_ENDPOINT 
      ? `${process.env.CDN_ENDPOINT}/${key}?v=${Date.now()}` 
      : `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${key}?v=${Date.now()}`;
    
    // Clean up temp file
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }
    
    return {
      success: true,
      url: manifestUrl,
      key,
      originalResult: result
    };
  } catch (error) {
    console.error(`❌ Error uploading manifest to S3: ${error.message}`);
    throw error;
  }
}

/**
 * Generate CDN URLs for product images
 * @param {string} slug - Product slug
 * @param {number} timestamp - Version timestamp for cache busting
 * @returns {Object} Object with thumbnail, zoom and enhanced URLs
 */
function generateProductImageUrls(slug, timestamp) {
  const cdnBase = process.env.CDN_ENDPOINT || '';
  const versionParam = `?v=${timestamp}`;
  
  return {
    thumbnail: `${cdnBase}/product-images/dynamic/thumbnail/${slug}.webp${versionParam}`,
    zoom: `${cdnBase}/product-images/dynamic/zoom/${slug}.webp${versionParam}`,
    enhanced: `${cdnBase}/product-images/dynamic/zoom/${slug}.webp${versionParam}`
  };
}

module.exports = {
  uploadToS3,
  uploadJsonManifest,
  generateProductImageUrls,
  s3
}; 