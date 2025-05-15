/**
 * Server Entry Point
 * Starts the HTTP server and sets up scheduled tasks
 */

const app = require('./app');
const cron = require('node-cron');
const kiotvietService = require('./services/kiotvietService');
const { getTodayComponents, formatYMD } = require('./utils/dateUtils');
const discordService = require('./services/discordService');

// Schedule KiotViet data sync jobs
const scheduleKiotVietSyncJobs = () => {
  // Token refresh - Every day at 1 AM
  console.log('🕒 Scheduling KiotViet token refresh at 1 AM');
  cron.schedule('0 1 * * *', async () => {
    console.log('🔄 Refreshing KiotViet access token...');
    try {
      await kiotvietService.refreshKiotVietToken();
      console.log('✅ KiotViet token refreshed successfully');
    } catch (err) {
      console.error('❌ Failed to refresh KiotViet token:', err);
    }
  }, {
    timezone: process.env.TIMEZONE || 'UTC'
  });

  // All other services sync - Every day at 2 AM
  console.log('🕒 Scheduling all KiotViet services sync at 2 AM');
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 Running KiotViet services sync');
    try {
      // Products and Pricebooks
      console.log('📦 Syncing products and pricebooks...');
      await kiotvietService.cloneProducts();
      await kiotvietService.clonePricebooks();
      
      // Customers
      console.log('👥 Syncing customers...');
      await kiotvietService.cloneCustomers();
      
      // Today's invoices
      console.log('🧾 Syncing today\'s invoices...');
      const { year, month, day } = getTodayComponents();
      await kiotvietService.cloneInvoicesByDay(year, month, day);
      
      // Purchase orders
      console.log('📝 Syncing recent purchase orders...');
      await kiotvietService.cloneRecentPurchaseOrders();
      
      console.log('✅ All KiotViet services sync completed successfully');
    } catch (err) {
      console.error('❌ Error during KiotViet services sync:', err);
    }
  }, {
    timezone: process.env.TIMEZONE || 'UTC'
  });
};

// Start the Discord bot if token is available
const startDiscordBot = () => {
  if (process.env.DISCORD_BOT_TOKEN) {
    console.log('🤖 Discord bot token found, starting bot...');
    discordService.startBot();
  } else {
    console.log('ℹ️ Discord bot token not found, skipping bot initialization');
  }
};

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  scheduleKiotVietSyncJobs();
  startDiscordBot();
}); 

/**
 * Manually testing refreshKiotVietToken()
 */
// if (process.env.NODE_ENV === 'dev-hot' && process.env.TEST_KV_TOKEN_REFRESH === '1') {
//   (async () => {
//     console.log('🔥 Manually testing refreshKiotVietToken()');
//     await kiotvietService.refreshKiotVietToken();
//     process.exit(0); // optional: auto exit after test
//   })();
// }