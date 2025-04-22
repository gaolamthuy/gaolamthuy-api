/**
 * Server Entry Point
 * Starts the HTTP server and sets up scheduled tasks
 */

const app = require('./app');
// Removed updateImageManifest reference

// Schedule manifest updates - every hour
const scheduleManifestUpdates = () => {
  console.log('📋 Skipping manifest updates - feature disabled');
  // All manifest update code removed
};

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  scheduleManifestUpdates();
}); 