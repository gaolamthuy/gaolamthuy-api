/**
 * Direct Test for Media Manifest Generation
 * Tests the updateImageManifest function directly without going through Express
 */

// Load environment variables
require('dotenv').config();

// Import required modules
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const AWS = require('aws-sdk');

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create Supabase client
console.log('Setting up Supabase client...');
console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Configure S3 client directly
console.log('Setting up S3 client...');
console.log(`S3 Endpoint: ${process.env.S3_ENDPOINT}`);
console.log(`S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
console.log(`S3 Region: ${process.env.S3_REGION || 'auto'}`);
console.log(`AWS SDK Version: ${AWS.VERSION}`);

const s3 = new AWS.S3({
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: process.env.S3_REGION || 'auto',
  signatureVersion: 'v4',
});

async function generateManifest() {
  try {
    console.log('Starting direct manifest generation test...');

    // Get all products with images (image_updated_at is not null)
    console.log('Fetching products from Supabase...');
    const { data: products, error } = await supabase
      .from('glt_products')
      .select('id, kiotviet_id, slug, tags, image_updated_at, sort_order, visible')
      .order('sort_order', { ascending: true, nullsLast: true })
      .order('id', { ascending: true })
      .not('image_updated_at', 'is', null);
    
    if (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
    
    console.log(`Found ${products.length} products with images`);
    
    // Build the manifest
    console.log('Building manifest...');
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
    
    // Save to local file first
    const manifestFileName = 'product-images-manifest-direct-test.json';
    const manifestPath = path.join(tempDir, manifestFileName);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Saved manifest to ${manifestPath}`);
    console.log(`File size: ${fs.statSync(manifestPath).size} bytes`);
    
    // 1. First try using uploadToS3 from s3Upload.js
    try {
      console.log('\n1. TESTING uploadToS3 UTILITY FUNCTION');
      // Import the utility function from our consolidated s3.js
      const { uploadToS3 } = require('../utils/s3');
      const manifestKey = 'product-images/manifest-utility-test.json';
      
      console.log(`Uploading to S3 using utility function...`);
      const uploadResult = await uploadToS3(manifestPath, manifestFileName, manifestKey);
      console.log('Upload successful using utility!');
      console.log('Result:', uploadResult);
    } catch (error) {
      console.error('Error uploading with utility function:', error.message);
    }
    
    // 2. Try using s3.upload directly
    try {
      console.log('\n2. TESTING S3.UPLOAD METHOD');
      const manifestKey = 'product-images/manifest-upload-test.json';
      
      console.log(`Uploading to S3 using s3.upload...`);
      const uploadParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: manifestKey,
        Body: fs.readFileSync(manifestPath),
        ContentType: 'application/json',
        CacheControl: 'max-age=60'
      };
      
      const uploadResult = await s3.upload(uploadParams).promise();
      console.log('Upload successful using s3.upload!');
      console.log('Result:', uploadResult);
    } catch (error) {
      console.error('Error uploading with s3.upload:', error.message);
      console.error('Error details:', error);
    }
    
    // 3. Try using s3.putObject
    try {
      console.log('\n3. TESTING S3.PUTOBJECT METHOD');
      const manifestKey = 'product-images/manifest-putobject-test.json';
      
      console.log(`Uploading to S3 using s3.putObject...`);
      const putParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: manifestKey,
        Body: fs.readFileSync(manifestPath),
        ContentType: 'application/json',
        CacheControl: 'max-age=60'
      };
      
      const putResult = await s3.putObject(putParams).promise();
      console.log('Upload successful using s3.putObject!');
      console.log('Result:', putResult);
    } catch (error) {
      console.error('Error uploading with s3.putObject:', error.message);
      console.error('Error details:', error);
    }
    
    console.log('\nTest completed - Check which methods were successful!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
generateManifest().catch(console.error); 