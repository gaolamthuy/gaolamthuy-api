/**
 * Discord Bot Service
 * Handles Discord bot interactions and image processing
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mediaController = require('../controllers/mediaController');
const { cloneProducts, cloneCustomers, cloneInvoicesByDay, cloneRecentPurchaseOrders } = require('./kiotvietService');
const { getShortPriceString, processEnhancedZoomImage } = mediaController;

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Discord bot configuration
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const channelId = process.env.DISCORD_CHANNEL_ID;

// Create Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('upload-rice-image')
    .setDescription('Get rice images from recent messages and upload them to our system')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('clone-kv-data')
    .setDescription('Clone data from KiotViet')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of data to clone')
        .setRequired(true)
        .addChoices(
          { name: 'Products', value: 'products' },
          { name: 'Customers', value: 'customers' },
          { name: 'Today\'s Invoices', value: 'invoices' },
          { name: 'Purchase Orders', value: 'purchase-orders' },
          { name: 'All', value: 'all' }
        ))
    .toJSON()
];

/**
 * Initialize the Discord bot and register slash commands
 */
async function initializeBot() {
  try {
    console.log('🤖 Starting Discord bot initialization...');
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(token);
    
    console.log('🔄 Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(client.application?.id || process.env.DISCORD_CLIENT_ID, guildId),
      { body: commands }
    );
    console.log('✅ Slash commands registered successfully');
    
    console.log('🤖 Discord bot initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Discord bot:', error);
  }
}

/**
 * Handle the /upload-rice-image command by processing recent images
 * @param {Object} interaction - Discord interaction object
 */
async function handleUploadRiceImageCommand(interaction) {
  // Variable to track if interaction has already been acknowledged/replied to
  let isInteractionReplied = false;

  try {
    // Acknowledge the command to show "Bot is thinking..."
    await interaction.deferReply();
    isInteractionReplied = true;
    
    console.log('🔄 Processing /upload-rice-image command...');
    
    // Get channel
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      await interaction.editReply('❌ Channel not found. Check the channel ID in the environment variables.');
      return;
    }
    
    // Get recent messages (from the last 24 hours)
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    let processedCount = 0;
    let errorCount = 0;
    let messageCount = 0;
    
    // Fetch up to 100 messages
    const messages = await channel.messages.fetch({ limit: 100 });
    
    // Filter messages from the last 24 hours that have attachments and are not from bots
    const recentMessages = messages.filter(msg => 
      msg.createdTimestamp > twentyFourHoursAgo && 
      msg.attachments.size > 0 &&
      !msg.author.bot // Skip messages from bots
    );
    
    messageCount = recentMessages.size;
    console.log(`📥 Found ${messageCount} messages with attachments in the last 24 hours`);
    
    if (messageCount === 0) {
      await interaction.editReply('ℹ️ No messages with images found in the last 24 hours.');
      return;
    }
    
    // Create progress update
    await interaction.editReply(`🔄 Processing ${messageCount} messages with attachments...`);
    
    // Process each message
    for (const [_, message] of recentMessages) {
      for (const [__, attachment] of message.attachments) {
        try {
          // Check if the attachment is an image
          if (!attachment.contentType?.startsWith('image/')) {
            console.log(`⏩ Skipping non-image attachment: ${attachment.name}`);
            continue;
          }
          
          // Get tag from attachment.description
          let tag = null;
          
          if (attachment.description && attachment.description.trim() !== '') {
            console.log(`📝 Processing attachment description: "${attachment.description}"`);
            tag = attachment.description.trim();
            console.log(`🏷️ Using attachment description as tag: ${tag}`);
          } else if (message.content && message.content.trim() !== '') {
            console.log(`📝 Processing message content as fallback: "${message.content}"`);
            
            // Look for tag patterns like #tag or [tag]
            const tagMatch = message.content.match(/#(\w+-\w+)|\[(\w+-\w+)\]/);
            if (tagMatch) {
              tag = tagMatch[1] || tagMatch[2]; // Use the captured group that matched
              console.log(`🏷️ Found tag in format #tag or [tag]: ${tag}`);
            } else {
              // Use the first word as tag
              tag = message.content.trim().split(/\s+/)[0];
              console.log(`🏷️ Using first word from message content as tag: ${tag}`);
            }
          } else {
            console.log(`⚠️ No description or message content found for image`);
          }
          
          // If no tag found or tag is too long (likely file ID), use the attachment name without extension
          if (!tag || tag.length > 20) {
            const fileNameWithoutExt = attachment.name.replace(/\.[^/.]+$/, "");
            tag = fileNameWithoutExt;
            console.log(`🏷️ Using file name as fallback tag: ${tag}`);
          }
          
          console.log(`🔄 Processing image with tag: ${tag}`);
          
          // Download the image to a temporary location
          const imagePath = path.join(tempDir, attachment.name);
          const imageUrl = attachment.url;
          
          console.log(`📥 Downloading image from: ${imageUrl}`);
          const imageResponse = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'stream'
          });
          
          // Save the image to disk
          const writer = fs.createWriteStream(imagePath);
          imageResponse.data.pipe(writer);
          
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
          
          console.log(`✅ Image downloaded to: ${imagePath}`);
          
          // Create a mock request object for the media controller
          const mockReq = {
            file: {
              path: imagePath,
              originalname: attachment.name
            },
            body: {
              tags: tag
            }
          };
          
          // Create a mock response object
          let uploadResponseData = null;
          const mockRes = {
            status: (code) => ({
              json: (data) => {
                console.log(`🔄 Upload response (${code}):`, data.success ? 'Success' : 'Failed');
                if (data.images && data.images.thumbnail) {
                  console.log(`🖼️ Thumbnail URL: ${data.images.thumbnail.url}`);
                }
                uploadResponseData = data; // Store the response data
                return data;
              }
            }),
            headersSent: false
          };
          
          // Print contents of temp directory for debugging
          const tempFiles = fs.readdirSync(tempDir);
          console.log(`📁 Temp directory contents before processing: ${tempFiles.join(', ')}`);
          
          // We need to process the image manually instead of using handleUploadAndUpdateManifest
          // because we need access to the files before they're deleted
          
          try {
            // First create the thumbnail and zoom images using handleUpload
            await mediaController.handleUpload(mockReq, mockRes);
            
            // Check temp directory again to see what files were created
            const tempFilesAfter = fs.readdirSync(tempDir);
            console.log(`📁 Temp directory contents after processing: ${tempFilesAfter.join(', ')}`);
            
            // Now process the enhanced image if we have product data
            if (uploadResponseData && uploadResponseData.product && uploadResponseData.product.category_id) {
              const productSlug = uploadResponseData.product.glt_slug || uploadResponseData.product.slug;
              if (!productSlug) {
                console.log(`⚠️ No product slug available for enhanced image`);
              } else {
                const zoomPath = path.join(tempDir, `${productSlug}-zoom.webp`);
                
                // Check if the image file still exists (it should at this point)
                if (fs.existsSync(zoomPath)) {
                  console.log(`✅ Found zoom image at ${zoomPath}, creating enhanced version`);
                  try {
                    const enhancedKey = await processEnhancedZoomImage(
                      zoomPath, 
                      productSlug, 
                      uploadResponseData.product.id,
                      uploadResponseData.product.category_id,
                      tempDir
                    );
                    if (enhancedKey) {
                      console.log(`🖼️ Enhanced image created and uploaded: ${enhancedKey}`);
                    }
                  } catch (enhancedError) {
                    console.error(`❌ Error creating enhanced image: ${enhancedError.message}`);
                  }
                } else {
                  console.log(`⚠️ Zoom image not found at ${zoomPath}`);
                }
              }
            } else {
              console.log(`⚠️ Product data not complete for enhanced image processing`);
            }
            
            // Now we can update the manifest
            await mediaController.updateImageManifest();
            
            // Clean up any remaining temporary files
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
              console.log(`🗑️ Cleaned up original image: ${imagePath}`);
            }
            
            if (uploadResponseData && uploadResponseData.product) {
              const productSlug = uploadResponseData.product.glt_slug || uploadResponseData.product.slug;
              if (productSlug) {
                const zoomPath = path.join(tempDir, `${productSlug}-zoom.webp`);
                if (fs.existsSync(zoomPath)) {
                  fs.unlinkSync(zoomPath);
                  console.log(`🗑️ Cleaned up zoom image: ${zoomPath}`);
                }
              }
            }
            
          } catch (error) {
            console.error(`❌ Error processing image:`, error);
            errorCount++;
          }
          
          processedCount++;
          console.log(`✅ Processed image ${processedCount}: ${attachment.name} with tag ${tag}`);
          
        } catch (error) {
          console.error(`❌ Error processing attachment: ${attachment.name}`, error);
          errorCount++;
        }
      }
    }
    
    // Provide a summary
    await interaction.editReply(`✅ Processed ${processedCount} rice images from ${messageCount} messages\n❌ Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('❌ Error processing upload-rice-image command:', error);
    
    // Try to respond if the interaction hasn't been replied to yet
    try {
      if (!isInteractionReplied) {
        await interaction.reply('❌ An error occurred while processing images. Check the server logs.');
      } else {
        await interaction.editReply('❌ An error occurred while processing images. Check the server logs.');
      }
    } catch (replyError) {
      console.error('❌ Error sending reply:', replyError);
    }
  }
}

/**
 * Handle the /clone-kv-data command to sync data from KiotViet
 * @param {Object} interaction - Discord interaction object
 */
async function handleCloneKvDataCommand(interaction) {
  try {
    // Acknowledge the command to show "Bot is thinking..."
    await interaction.deferReply();
    
    // Get the data type from options
    const dataType = interaction.options.getString('type');
    console.log(`🔄 Processing /clone-kv-data command for type: ${dataType}...`);
    
    if (dataType === 'all') {
      await interaction.editReply('🔄 Starting to clone all KiotViet data... this may take a while.');
      
      // Clone all data types in sequence
      const results = {
        products: null,
        customers: null,
        invoices: null,
        purchaseOrders: null
      };
      
      try {
        await interaction.editReply('🔄 Cloning products from KiotViet...');
        results.products = await cloneProducts();
      } catch (error) {
        console.error('❌ Error cloning products:', error);
        results.products = { success: false, message: error.message };
      }
      
      try {
        await interaction.editReply('🔄 Cloning customers from KiotViet...');
        results.customers = await cloneCustomers();
      } catch (error) {
        console.error('❌ Error cloning customers:', error);
        results.customers = { success: false, message: error.message };
      }
      
      try {
        const today = new Date();
        await interaction.editReply('🔄 Cloning today\'s invoices from KiotViet...');
        results.invoices = await cloneInvoicesByDay(
          today.getFullYear(),
          today.getMonth() + 1,
          today.getDate()
        );
      } catch (error) {
        console.error('❌ Error cloning invoices:', error);
        results.invoices = { success: false, message: error.message };
      }
      
      try {
        await interaction.editReply('🔄 Cloning purchase orders from KiotViet...');
        results.purchaseOrders = await cloneRecentPurchaseOrders();
      } catch (error) {
        console.error('❌ Error cloning purchase orders:', error);
        results.purchaseOrders = { success: false, message: error.message };
      }
      
      // Generate summary message
      const summary = [
        '## KiotViet Data Cloning Summary',
        '',
        `**Products**: ${results.products?.success ? '✅ Success' : '❌ Failed'} ${results.products?.count?.total ? `(${results.products.count.total} items)` : ''}`,
        `**Customers**: ${results.customers?.success ? '✅ Success' : '❌ Failed'} ${results.customers?.count?.total ? `(${results.customers.count.total} items)` : ''}`,
        `**Today's Invoices**: ${results.invoices?.success ? '✅ Success' : '❌ Failed'} ${results.invoices?.count?.total ? `(${results.invoices.count.total} items)` : ''}`,
        `**Purchase Orders**: ${results.purchaseOrders?.success ? '✅ Success' : '❌ Failed'} ${results.purchaseOrders?.stats?.total ? `(${results.purchaseOrders.stats.total} items)` : ''}`,
        '',
        `Completed at: ${new Date().toLocaleString()}`
      ].join('\n');
      
      await interaction.editReply(summary);
    } else {
      // Clone single data type
      await interaction.editReply(`🔄 Starting to clone ${dataType} from KiotViet...`);
      
      let result;
      
      switch (dataType) {
        case 'products':
          result = await cloneProducts();
          break;
        case 'customers':
          result = await cloneCustomers();
          break;
        case 'invoices':
          const today = new Date();
          result = await cloneInvoicesByDay(
            today.getFullYear(),
            today.getMonth() + 1,
            today.getDate()
          );
          break;
        case 'purchase-orders':
          result = await cloneRecentPurchaseOrders();
          break;
      }
      
      if (result.success) {
        const count = result.count?.total || result.stats?.total || '?';
        await interaction.editReply(`✅ Successfully cloned ${dataType} from KiotViet (${count} items)\n\nMessage: ${result.message}`);
      } else {
        await interaction.editReply(`❌ Failed to clone ${dataType} from KiotViet\n\nError: ${result.message}`);
      }
    }
  } catch (error) {
    console.error('❌ Error in handleCloneKvDataCommand:', error);
    
    // Check if interaction has already been replied to
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`❌ Error: ${error.message}`);
    } else {
      await interaction.reply(`❌ Error: ${error.message}`);
    }
  }
}

/**
 * Start the Discord bot
 */
function startBot() {
  console.log('🔄 Starting Discord bot...');
  
  if (!token) {
    console.error('❌ DISCORD_BOT_TOKEN is not defined in environment variables');
    return;
  }
  
  client.once('ready', () => {
    console.log(`🤖 Discord bot is ready! Logged in as ${client.user.tag}`);
    initializeBot();
  });
  
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    
    const { commandName } = interaction;
    
    if (commandName === 'upload-rice-image') {
      await handleUploadRiceImageCommand(interaction);
    } else if (commandName === 'clone-kv-data') {
      await handleCloneKvDataCommand(interaction);
    }
  });
  
  client.login(token)
    .then(() => console.log('🤖 Discord bot started successfully'))
    .catch(error => console.error('❌ Failed to start Discord bot:', error));
}

module.exports = {
  startBot,
  client
}; 