/**
 * Server Entry Point
 * Starts the HTTP server and sets up scheduled tasks
 */

const app = require('./app');
const cron = require('node-cron');
const kiotvietService = require('./services/kiotvietService');
const { getTodayComponents, formatYMD } = require('./utils/dateUtils');
const discordService = require('./services/discordService');

// Schedule manifest updates - every hour
const scheduleManifestUpdates = () => {
  console.log('📋 Skipping manifest updates - feature disabled');
  // All manifest update code removed
};

// Schedule KiotViet data sync jobs - daily at midnight
const scheduleKiotVietSyncJobs = () => {
  console.log('🕒 Scheduling KiotViet token refresh at 1AM');
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

  console.log('🕒 Scheduling daily KiotViet data sync jobs at 2AM');
  cron.schedule('0 2 * * *', async () => {
    console.log('🌅 Running daily KiotViet data sync jobs');
    try {
      await kiotvietService.cloneCustomers();
      await kiotvietService.cloneProducts();
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
  console.log('🕒 Scheduling KiotViet invoice updates (every 30 minutes)');
  cron.schedule('0,30 * * * *', async () => {
    console.log('🌅 Running KiotViet invoice update');
    try {
      // Clone today's invoices
      const { year, month, day } = getTodayComponents();
      const formattedDate = formatYMD({ year, month, day });
      
      console.log(`🔄 Cloning invoices for today: ${formattedDate}`);
      await kiotvietService.cloneInvoicesByDay(year, month, day);
      console.log(`✅ KiotViet invoice clone completed successfully for ${formattedDate}`);
    } catch (err) {
      console.error('❌ Error during KiotViet invoice update', err);
    }
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
  scheduleManifestUpdates();
  scheduleKiotVietSyncJobs();
  scheduleKiotVietInvoice();
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