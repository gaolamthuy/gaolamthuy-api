require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mediaRoutes = require('./routes/mediaRoutes');
const path = require('path');
const morgan = require('morgan');
const kiotvietRoutes = require('./routes/kiotvietRoutes');
const posRoutes = require('./routes/posRoutes');
const printRoutes = require('./routes/printRoutes');

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

// Simple health check
app.get("/", (req, res) => {
  res.json({
    message: 'Gao Lam Thuy Internal API',
    version: '1.0.0',
    endpoints: [
      '/media - Media upload and management',
      '/kiotviet - KiotViet data synchronization',
      '/print - Print invoices and product labels'
    ]
  });
});

// Catch-all for 404 errors
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

module.exports = app; 