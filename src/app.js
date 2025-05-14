require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require('path');
const morgan = require('morgan');
const { errorResponse } = require('./utils/responseHandler');

// Import routes
const mediaRoutes = require('./routes/mediaRoutes');
const kiotvietRoutes = require('./routes/kiotvietRoutes');
const posRoutes = require('./routes/posRoutes');
const printRoutes = require('./routes/printRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();

// Initial request logging
app.use((req, res, next) => {
    console.log('\n🔍 Incoming Request:', {
        method: req.method,
        url: req.url,
        headers: req.headers
    });
    next();
});

// Raw body parser for KiotViet webhooks
const rawBodyParser = (req, res, next) => {
    if (req.url.startsWith('/kiotviet/webhook') && req.headers['content-type'] === 'application/json') {
        console.log('📥 KiotViet JSON Webhook: Capturing raw body.');
        let data = [];
        req.on('data', chunk => {
            data.push(chunk);
            // console.log('📦 Received chunk of size:', chunk.length); // Optional: can be verbose
        });
        req.on('end', () => {
            try {
                const rawBodyString = Buffer.concat(data).toString();
                req.rawBody = rawBodyString; // For signature verification
                console.log('✅ Raw body captured. Length:', req.rawBody.length);
                // We will let the route-specific middleware or express.json parse req.body
            } catch (e) {
                console.error('❌ Error processing raw body in rawBodyParser:', e);
            } finally {
                next();
            }
        });
    } else {
        next();
    }
};

// Middleware order is important
app.use(cors());
app.use(morgan('dev')); // Added morgan for standard HTTP request logging

app.use(rawBodyParser);  // Custom raw body parser

// Logging before express.json()
/*
app.use((req, res, next) => {
    console.log('🚦 BEFORE express.json(). URL:', req.url, 'Has rawBody:', !!req.rawBody);
    next();
});
*/

app.use(express.json()); // Standard JSON parser

// Logging after express.json()
/*
app.use((req, res, next) => {
    console.log('🚦 AFTER express.json(). URL:', req.url, 'Body type:', typeof req.body, 'Has req.body:', req.body !== undefined);
    if (req.url.startsWith('/kiotviet/webhook')) {
        console.log('🔬 Webhook state after express.json: rawBody length:', req.rawBody?.length, 'parsed body:', req.body);
    }
    next();
});
*/

app.use(express.urlencoded({ extended: true }));

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes - ensure specific webhook routes are prioritized
app.use('/media', mediaRoutes);
// app.use('/kiotviet', kiotvietRoutes); // Moved after webhookRoutes
app.use('/pos', posRoutes);
app.use('/print', printRoutes);
app.use('/payment', paymentRoutes);
app.use('/', webhookRoutes);  // Mount webhook routes at root, handles /kiotviet/webhook/*
app.use('/kiotviet', kiotvietRoutes); // General KiotViet routes with basicAuth

// Simple health check
app.get("/", (req, res) => {
  res.json({
    message: 'Gao Lam Thuy Internal API',
    version: '1.0.0',
    endpoints: [
      '/media - Media upload and management',
      '/kiotviet - KiotViet data synchronization',
      '/print - Print invoices and product labels',
      '/payment - Process payment notifications from banks and mobile payment services',
      '/kiotviet/webhook/product-update - KiotViet product update webhook'
    ]
  });
});

// Test route for debugging printing issues
app.get("/test-print", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Print Page</title>
      <style>
        body { font-family: Arial; margin: 20px; }
        h1 { color: #2c3e50; }
        .test-box { 
          border: 1px solid #ccc; 
          padding: 15px; 
          margin: 10px 0; 
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <h1>Print Test Page</h1>
      <div class="test-box">
        <h2>Environment Info</h2>
        <p>Server time: ${new Date().toISOString()}</p>
        <p>SUPABASE_URL set: ${process.env.SUPABASE_URL ? 'Yes' : 'No'}</p>
        <p>SUPABASE_SERVICE_KEY set: ${process.env.SUPABASE_SERVICE_KEY ? 'Yes' : 'No'}</p>
      </div>
      <div class="test-box">
        <h2>Test Links</h2>
        <ul>
          <li><a href="/print/kv-invoice?code=HD057559">Print Invoice HD057559</a></li>
          <li><a href="/print/label-product?code=2011102">Print Product Label 2011102</a></li>
        </ul>
      </div>
    </body>
    </html>
  `);
});

// Health check endpoint for deployment platform
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Catch-all for 404 errors
app.use((req, res, next) => {
  return errorResponse(res, `Route ${req.originalUrl} not found`, null, 404);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Global Error Handler:', err.stack);
  return errorResponse(res, err.message || 'Internal Server Error', err, err.status || 500);
});

module.exports = app; 