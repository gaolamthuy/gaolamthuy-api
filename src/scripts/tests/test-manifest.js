/**
 * Test Media Manifest Generation
 * Script to test generating the image manifest directly
 */

// Load environment variables
require('dotenv').config();

// Import required modules
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { s3 } = require('../utils/s3');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function generateManifest() {
  try {
    console.log('Starting manifest generation test...');

    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Get all products with images (glt_image_updated_at is not null)
    console.log('Fetching products from Supabase...');
    const { data: products, error } = await supabase
      .from('kv_products')
      .select('id, kiotviet_id, glt_slug, glt_tags, glt_image_updated_at, glt_sort_order, glt_visible')
      .order('glt_sort_order', { ascending: true, nullsLast: true })
      .order('id', { ascending: true })
      .not('glt_image_updated_at', 'is', null);
    
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
        const versionParam = `?v=${product.glt_image_updated_at}`;
        
        return {
          id: product.id,
          kiotvietId: product.kiotviet_id,
          slug: product.glt_slug,
          tags: product.glt_tags,
          updatedAt: product.glt_image_updated_at,
          visible: product.glt_visible,
          sortOrder: product.glt_sort_order,
          urls: {
            thumbnail: `${cdnBase}/product-images/dynamic/thumbnail/${product.glt_slug}.webp${versionParam}`,
            zoom: `${cdnBase}/product-images/dynamic/zoom/${product.glt_slug}.webp${versionParam}`
          }
        };
      })
    };
    
    // Save to local file first
    const manifestPath = path.join(tempDir, 'manifest-test.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Saved manifest to ${manifestPath}`);
    
    // Upload to S3
    console.log('Uploading to S3...');
    const manifestKey = 'product-images/manifest-test.json';
    
    try {
      await s3.upload({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: manifestKey,
        Body: fs.readFileSync(manifestPath),
        ContentType: 'application/json',
        CacheControl: 'max-age=60'
      }).promise();
      
      console.log('Upload successful!');
      
      // Generate URL
      const manifestUrl = process.env.CDN_ENDPOINT 
        ? `${process.env.CDN_ENDPOINT}/${manifestKey}?v=${Date.now()}` 
        : `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${manifestKey}?v=${Date.now()}`;
      
      console.log(`Manifest available at: ${manifestUrl}`);
    } catch (uploadError) {
      console.error('Error uploading to S3:', uploadError);
      
      // Print S3 config for debugging (excluding secret key)
      console.log('S3 Configuration:');
      console.log(`  Endpoint: ${process.env.S3_ENDPOINT}`);
      console.log(`  Bucket: ${process.env.S3_BUCKET_NAME}`);
      console.log(`  Region: ${process.env.S3_REGION || 'auto'}`);
      console.log(`  Access Key ID: ${process.env.S3_ACCESS_KEY ? '******' : 'Not set'}`);
      console.log(`  Secret Key: ${process.env.S3_SECRET_KEY ? '[REDACTED]' : 'Not set'}`);
    }
    
    console.log('Test completed');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
generateManifest().catch(console.error); 