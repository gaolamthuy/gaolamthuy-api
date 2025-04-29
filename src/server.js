/**
 * Server Entry Point
 * Starts the HTTP server and sets up scheduled tasks
 */

const app = require('./app');
const cron = require('node-cron');
const kiotvietService = require('./services/kiotvietService');
// Removed updateImageManifest reference

// Schedule manifest updates - every hour
const scheduleManifestUpdates = () => {
  console.log('📋 Skipping manifest updates - feature disabled');
  // All manifest update code removed
};

// Schedule KiotViet data sync jobs - daily at midnight
const scheduleKiotVietSyncJobs = () => {
  console.log('🕒 Scheduling daily KiotViet data sync jobs');
  cron.schedule('0 0 * * *', async () => {
    console.log('🌅 Running daily KiotViet data sync jobs');
    try {
      // Clone customers
      await kiotvietService.cloneCustomers();
      // Clone products
      await kiotvietService.cloneProducts();
      // // Clone today's invoices
      // const today = new Date();
      // const year = today.getFullYear().toString();
      // const month = (today.getMonth() + 1).toString().padStart(2, '0');
      // const day = today.getDate().toString().padStart(2, '0');
      // console.log(`🔄 Cloning invoices for today: ${year}-${month}-${day}`);
      // await kiotvietService.cloneInvoicesByDay(year, month, day);
      console.log('✅ Daily KiotViet data sync jobs completed successfully');
    } catch (err) {
      console.error('❌ Error during daily KiotViet data sync jobs', err);
    }
  }, {
    timezone: process.env.TIMEZONE || 'UTC'
  });
};

// Schedule KiotViet invoice - every 30 minutes
const scheduleKiotVietInvoice = () => {
  console.log('🕒 Scheduling KiotViet invoice');
  cron.schedule('0,30 * * * *', async () => {
    console.log('🌅 Running KiotViet invoice');
    try {
      // Clone today's invoices
      const today = new Date();
      const year = today.getFullYear().toString();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const day = today.getDate().toString().padStart(2, '0');
      await kiotvietService.cloneInvoicesByDay(year, month, day);
      console.log(`✅ KiotViet invoice clone by day ${day}-${month}-${year} completed successfully`);
    } catch (err) {
      console.error('❌ Error during KiotViet invoice', err);
    }
  });
};

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  scheduleManifestUpdates();
  scheduleKiotVietSyncJobs();
}); 