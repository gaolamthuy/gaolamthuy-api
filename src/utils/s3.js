const AWS = require('aws-sdk');

// Configure S3/R2 client
const s3 = new AWS.S3({
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: process.env.S3_REGION || 'auto',
  signatureVersion: 'v4',
});

module.exports = s3; 