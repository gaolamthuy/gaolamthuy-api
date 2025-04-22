/**
 * Test Media Manifest Endpoint
 * Script to test the media manifest generation endpoint directly using axios
 */

// Load environment variables
require('dotenv').config();

const axios = require('axios');

async function testMediaManifestEndpoint() {
  try {
    console.log('Testing media manifest endpoint...');
    
    const baseUrl = process.env.API_URL || 'http://localhost:3001';
    const endpoint = '/media/manifest/generate';
    const url = `${baseUrl}${endpoint}`;
    
    console.log(`Making request to: ${url}`);
    
    // Create basic auth credentials
    const username = process.env.MEDIA_AUTH_USER || 'username123';
    const password = process.env.MEDIA_AUTH_PASS || 'password123456';
    
    // Base64 encode the credentials
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    
    // Make the request with a timeout
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${auth}`
      },
      timeout: 30000 // 30 second timeout
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:');
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received. Request:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error message:', error.message);
    }
    
    console.error('Error config:', error.config);
  }
}

// Run the test
testMediaManifestEndpoint().catch(console.error); 