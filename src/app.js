require("dotenv").config();
const express = require("express");
const cors = require("cors");
const kiotvietRoutes = require('./routes/kiotvietRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const path = require('path');
const morgan = require('morgan');
const { updateImageManifest } = require('./controllers/mediaController');

const app = express();

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/kiotviet', kiotvietRoutes);
app.use('/api/media', mediaRoutes);

// Simple health check
app.get("/", (req, res) => {
  res.send("✅ KiotViet Clone Service is running!");
});

// Schedule manifest updates - every hour
const scheduleManifestUpdates = () => {
  console.log('📋 Scheduling hourly manifest updates');
  
  // Initial update when server starts
  setTimeout(() => {
    console.log('📋 Generating initial manifest...');
    updateImageManifest()
      .then(url => console.log(`✅ Initial manifest generated: ${url}`))
      .catch(err => console.error('❌ Initial manifest generation failed:', err));
  }, 5000); // Wait 5 seconds after startup
  
  // Schedule hourly updates
  setInterval(() => {
    console.log('📋 Running scheduled manifest update...');
    updateImageManifest()
      .then(url => console.log(`✅ Scheduled manifest updated: ${url}`))
      .catch(err => console.error('❌ Scheduled manifest update failed:', err));
  }, 60 * 60 * 1000); // Every hour
};

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  scheduleManifestUpdates();
});

module.exports = app; 