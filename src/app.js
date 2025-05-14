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

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes - removed "/api" prefix for production
app.use('/media', mediaRoutes);
app.use('/kiotviet', kiotvietRoutes);
app.use('/pos', posRoutes);
app.use('/print', printRoutes);
app.use('/payment', paymentRoutes);
app.use('/', webhookRoutes);  // Webhook routes at root level

// Simple health check
app.get("/", (req, res) => {
  res.json({
    message: 'Gao Lam Thuy Internal API',
    version: '1.0.0',
    endpoints: [
      '/media - Media upload and management',
      '/kiotviet - KiotViet data synchronization',
      '/print - Print invoices and product labels',
      '/payment - Process payment notifications from banks and mobile payment services'
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

// Catch-all for 404 errors
app.use((req, res, next) => {
  return errorResponse(res, `Route ${req.originalUrl} not found`, null, 404);
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  return errorResponse(res, err.message || 'Internal Server Error', err);
});

module.exports = app; 