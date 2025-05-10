const axios = require('axios');

/**
 * Handle incoming payment transaction notifications
 * Processes notifications from bank/mobile payment services
 * and forwards them to Discord webhooks based on transaction data
 */
const handleTransaction = async (req, res) => {
  try {
    const requestBody = req.body;
    
    // Validate request body
    if (!requestBody || !requestBody.type || !requestBody.body) {
      return res.status(400).json({
        success: false,
        message: "Invalid request format. Required fields: type, body"
      });
    }

    // Extract transaction data
    const data = {
      typeTrans: requestBody.type,
      body: requestBody
    };

    // Determine if this is a valid transaction notification (VCB or MoMo)
    const isValidTransaction = 
      (data.body.body && (
        data.body.body.includes("Số dư TK VCB") || 
        data.body.body.includes("Bạn vừa được thanh toán")
      ));

    if (!isValidTransaction) {
      console.log('📌 Invalid transaction format:', JSON.stringify(data.body));
      return res.status(200).json({
        success: true,
        message: "Notification received but not processed: not a valid transaction format"
      });
    }

    // Process and extract transaction details
    const transactionData = extractTransactionData(data);
    console.log('📌 Extracted transaction data:', JSON.stringify(transactionData));

    // Determine if this is a test transaction
    const isTestTransaction = 
      (transactionData.accountNumber === "0071001027650") || 
      (transactionData.refVcb?.includes("test bang vib")) || 
      (transactionData.amountMomo?.includes("2,000"));

    // Send to Discord webhooks
    await sendToDiscord(transactionData, isTestTransaction);

    res.status(200).json({
      success: true,
      message: "Transaction notification processed successfully",
      data: {
        isTest: isTestTransaction,
        transactionType: transactionData.typeTrans
      }
    });
  } catch (error) {
    console.error('❌ Error processing transaction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Extract transaction data from the notification
 * @param {Object} data - The raw request data
 * @returns {Object} Extracted transaction details
 */
const extractTransactionData = (data) => {
  const transactionData = {
    typeTrans: data.typeTrans,
    accountNumber: data.body.body.match(/TK VCB (\d+) \+/)?.[1] || "",
    transactionType: data.body.body.match(/(\+|-)([\d,]+) VND/)?.[1] || "",
    amountVcb: data.body.body.match(/Số dư TK VCB \d+ \+([\d,]+) VND/)?.[1] || "",
    amountMomo: data.body.body.match(/Bạn vừa được thanh toán ([\d,.]+)đ từ tài khoản/)?.[1]?.replace(".", ",") || "",
    balance: data.body.body.match(/Số dư \d{1,3}(?:,\d{3})*(?:\.\d+)? VND|Số dư \d{1,3}(?:,\d{3})*(?:\.\d+)? VND/)?.[0] || "",
    refVcb: data.body.body.match(/VND\. Ref (.+)$/)?.[1] || "",
    refMomo: data.body.body.match(/Mã giao dịch .+$/)?.[0] || "",
    dateTimeMomo: data.body.timestamp || "",
  };

  // Process date and time for VCB transactions
  if (data.body.body.match(/(\d{2}-\d{2}-\d{4})/)) {
    // Extract date in format dd-MM-yyyy
    const dateMatch = data.body.body.match(/(\d{2}-\d{2}-\d{4})/)?.[1];
    if (dateMatch) {
      // Format date as Vietnamese locale (e.g., "Thứ Hai, 06/05/2024")
      const dateParts = dateMatch.split('-');
      const date = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
      const options = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
      transactionData.date = new Intl.DateTimeFormat('vi-VN', options).format(date);
    }

    // Extract time in format HH:mm:ss
    const timeMatch = data.body.body.match(/(\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})/)?.[1];
    if (timeMatch) {
      const timeParts = timeMatch.split(' ')[1].split(':');
      transactionData.time = timeParts.join(':');
    }
  }

  return transactionData;
};

/**
 * Send transaction notification to Discord webhooks
 * @param {Object} transactionData - The processed transaction data
 * @param {boolean} isTestTransaction - Whether this is a test transaction
 */
const sendToDiscord = async (transactionData, isTestTransaction) => {
  // Discord webhook URLs (add these to your environment variables)
  const adminWebhookUrl = process.env.DISCORD_ADMIN_WEBHOOK_URL;
  const shopstaffWebhookUrl = process.env.DISCORD_SHOPSTAFF_WEBHOOK_URL;

  if (!adminWebhookUrl || !shopstaffWebhookUrl) {
    console.error('❌ Discord webhook URLs not configured in environment variables');
    return;
  }

  // Prepare common webhook payload
  const getWebhookPayload = (isAdmin = false) => {
    // Determine title based on transaction type
    const title = transactionData.typeTrans === "com.mservice.momotransfer" 
      ? `${isAdmin ? "" : "✅ "}${transactionData.amountMomo} VND` 
      : `${isAdmin ? "" : "✅ "}${transactionData.amountVcb} VND`;

    // Determine description based on transaction type
    const description = transactionData.typeTrans === "com.mservice.momotransfer" 
      ? transactionData.refMomo 
      : (isAdmin 
          ? `${transactionData.refVcb}\nSTK ${transactionData.accountNumber} | ${transactionData.balance}${transactionData.amountMomo === "2,000" ? "\nTest momo 2k" : ""}` 
          : transactionData.refVcb);

    // Get formatted date & time
    let authorText;
    if (transactionData.typeTrans === "com.mservice.momotransfer" && transactionData.dateTimeMomo) {
      const date = new Date(parseInt(transactionData.dateTimeMomo));
      const options = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
      authorText = new Intl.DateTimeFormat('vi-VN', options).format(date);
    } else {
      authorText = `${transactionData.date} - ${transactionData.time}`;
    }

    // Determine color based on transaction type
    const color = transactionData.typeTrans === "com.mservice.momotransfer" ? "#ce007a" : "#007610";

    // Determine avatar URL based on transaction type
    const avatarUrl = transactionData.typeTrans === "com.mservice.momotransfer" 
      ? "https://github.com/gaolamthuy/unnamed-repo/blob/main/assets/momo-logo.png?raw=true" 
      : "https://github.com/gaolamthuy/unnamed-repo/blob/main/assets/vcb-logo.jpg?raw=true";

    // Determine username based on transaction type
    const username = transactionData.typeTrans === "com.mservice.momotransfer" 
      ? "MOMO nhận chuyển khoản" 
      : "VIETCOMBANK nhận chuyển khoản";

    return {
      username,
      avatar_url: avatarUrl,
      embeds: [
        {
          title,
          description,
          author: {
            name: authorText
          },
          color: parseInt(color.replace('#', ''), 16)
        }
      ]
    };
  };

  try {
    // Always send to admin webhook
    await axios.post(adminWebhookUrl, getWebhookPayload(true));
    console.log('✅ Notification sent to admin webhook');

    // Send to shopstaff webhook if not a test transaction
    if (!isTestTransaction) {
      await axios.post(shopstaffWebhookUrl, getWebhookPayload(false));
      console.log('✅ Notification sent to shopstaff webhook');
    }
  } catch (error) {
    console.error('❌ Error sending webhook notification:', error);
    throw error;
  }
};

module.exports = {
  handleTransaction
}; 