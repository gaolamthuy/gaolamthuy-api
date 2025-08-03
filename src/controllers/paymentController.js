const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const dayjs = require("dayjs");
const localizedFormat = require("dayjs/plugin/localizedFormat");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
require("dayjs/locale/vi");

dayjs.extend(localizedFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("vi");

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Handle incoming payment transaction notifications
 * Processes notifications from bank/mobile payment services,
 * stores them in the database, and forwards them to Discord webhooks
 */
const handleTransaction = async (req, res) => {
  try {
    // Log raw body cho mỗi lần request
    // console.log("===== Incoming POST /transaction =====");
    // console.log("Body:", JSON.stringify(req.body, null, 2));

    const requestBody = req.body;

    // Validate request body
    if (!requestBody || !requestBody.type || !requestBody.body) {
      return res.status(400).json({
        success: false,
        message: "Invalid request format. Required fields: type, body",
      });
    }

    // Extract transaction data
    const data = {
      typeTrans: requestBody.type,
      body: requestBody,
    };

    // Determine if this is a valid transaction notification (VCB or MoMo)
    const isValidTransaction =
      data.body.body &&
      (data.body.body.includes("Số dư TK VCB") ||
        data.body.body.includes("Bạn vừa được thanh toán"));

    if (!isValidTransaction) {
      console.log("📌 Invalid transaction format:", JSON.stringify(data.body));
      return res.status(200).json({
        success: true,
        message:
          "Notification received but not processed: not a valid transaction format",
      });
    }

    // Process and extract transaction details
    const transactionData = extractTransactionData(data);
    // console.log(
    //   "📌 Extracted transaction data:",
    //   JSON.stringify(transactionData)
    // );

    // Determine if this is a test transaction
    const isTestTransaction =
      transactionData.accountNumber === "0071001027650" ||
      transactionData.refVcb?.toLowerCase().includes("test") ||
      transactionData.amountMomo?.includes("2,000") ||
      (transactionData.amount && transactionData.amount <= 2000);

    // Prepare data for database storage
    const paymentData = preparePaymentData(transactionData, requestBody);

    // Store transaction in database
    const { data: savedPayment, error: dbError } = await supabase
      .from("glt_payment")
      .insert([paymentData])
      .select()
      .single();

    if (dbError) {
      console.error("❌ Error storing payment data:", dbError);
      // Continue processing even if database storage fails
    } else {
      console.log(
        "✅ Payment data stored in database with ID:",
        savedPayment.id
      );
    }

    // Send to Discord webhooks
    await sendToDiscord(transactionData, isTestTransaction);

    res.status(200).json({
      success: true,
      message: "Transaction notification processed and stored successfully",
      data: {
        isTest: isTestTransaction,
        transactionType: transactionData.typeTrans,
        paymentId: savedPayment?.id || null,
      },
    });
  } catch (error) {
    console.error("❌ Error processing transaction:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Extract transaction data from the notification
 * @param {Object} data - The raw request data
 * @returns {Object} Extracted transaction details
 */
const extractTransactionData = (data) => {
  const bodyText = data.body.body || "";
  const transactionData = {
    typeTrans: data.typeTrans,
    isMomoWithdrawal: bodyText.includes("Rút tiền thành công"),
  };

  if (data.typeTrans === "com.VCB") {
    // Account
    const accountMatch = bodyText.match(/TK VCB (\d+)/);
    transactionData.accountNumber = accountMatch ? accountMatch[1] : "";

    // Transaction type
    const typeMatch = bodyText.match(/TK VCB \d+ (\+|-)/);
    transactionData.transactionType = typeMatch ? typeMatch[1] : "+";

    // Amount
    const amountMatch = bodyText.match(/TK VCB \d+ (\+|-)([\d,]+) VND/);
    transactionData.amountVcb = amountMatch ? amountMatch[2] : "";

    // Dùng regex ăn hết unicode và khoảng trắng khác thường, và lấy số dư cuối cùng
    const balanceAll = [
      ...bodyText.matchAll(/S[ôó][\s\S]*?d[ưu][\s\S]*?([\d,]+)\s*VND/gi),
    ];
    const lastBalance = balanceAll.length
      ? balanceAll[balanceAll.length - 1][1]
      : null;
    transactionData.balance = lastBalance ? lastBalance : null;

    // Reference
    const refMatch = bodyText.match(/Ref (.+)$/);
    transactionData.refVcb = refMatch ? refMatch[1] : "";

    // DateTime
    const dateTimeMatch = bodyText.match(
      /l.{1,3}c (\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})/i
    );

    if (dateTimeMatch) {
      const fullDateTime = dateTimeMatch[1];
      // console.log("==> fullDateTime found:", fullDateTime); // THÊM DÒNG NÀY
      const [datePart, timePart] = fullDateTime.split(" ");
      const dateParts = datePart.split("-");
      transactionData.date = `${dateParts[0]}/${dateParts[1]}/${dateParts[2]}`;
      transactionData.time = timePart;
      transactionData.fullDateTime = fullDateTime;
    }
  } else if (data.typeTrans === "com.mservice.momotransfer") {
    // MoMo transaction format
    if (transactionData.isMomoWithdrawal) {
      // Handle withdrawal: "Rút tiền thành công"
      const amountMatch = bodyText.match(/Bạn đã rút ([\d,.]+)đ/);
      transactionData.amountMomo = amountMatch
        ? amountMatch[1].replace(".", ",")
        : "";
    } else {
      // Handle deposit: "Bạn vừa được thanh toán"
      const amountMatch = bodyText.match(
        /Bạn vừa được thanh toán ([\d,.]+)đ từ tài khoản/
      );
      transactionData.amountMomo = amountMatch
        ? amountMatch[1].replace(".", ",")
        : "";
    }

    // Extract reference (transaction ID)
    const refMatch = bodyText.match(/Mã giao dịch .+$/);
    transactionData.refMomo = refMatch ? refMatch[0] : "";

    // Extract timestamp
    transactionData.dateTimeMomo = data.body.timestamp || "";
  }

  return transactionData;
};

/**
 * Prepare data for storage in glt_payment table
 * @param {Object} transactionData - Extracted transaction data
 * @returns {Object} Formatted data for database storage
 */
const preparePaymentData = (transactionData, rawBody) => {
  // Parse amount: Chuẩn hóa về số
  const parseAmount = (amountStr) => {
    if (!amountStr) return null;
    return parseFloat(amountStr.replace(/,/g, ""));
  };

  // Parse balance: Chuẩn hóa về số
  const parseBalance = (balanceStr) => {
    if (!balanceStr) return null;
    const balanceMatch = balanceStr.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/);
    return balanceMatch ? parseFloat(balanceMatch[0].replace(/,/g, "")) : null;
  };

  // Xác định thời gian nhận (received_at)
  let receivedAt = null;

  // --- MoMo: timestamp là milliseconds (UTC+7)
  if (
    transactionData.typeTrans === "com.mservice.momotransfer" &&
    transactionData.dateTimeMomo
  ) {
    // Nếu muốn luôn là string ISO +07:00 (khuyên dùng, để không bị lệch khi insert vào Postgres/Supabase):
    const momoDate = new Date(parseInt(transactionData.dateTimeMomo));
    // Format thành 'YYYY-MM-DDTHH:mm:ss+07:00'
    const pad = (n) => n.toString().padStart(2, "0");
    receivedAt = `${momoDate.getFullYear()}-${pad(
      momoDate.getMonth() + 1
    )}-${pad(momoDate.getDate())}T${pad(momoDate.getHours())}:${pad(
      momoDate.getMinutes()
    )}:${pad(momoDate.getSeconds())}+07:00`;
  }
  // --- VCB: parse từ "dd-MM-yyyy HH:mm:ss"
  else if (transactionData.fullDateTime) {
    const [datePart, timePart] = transactionData.fullDateTime.split(" ");
    if (datePart && timePart) {
      const [day, month, year] = datePart.split("-");
      const [hours, minutes, seconds] = timePart.split(":");
      if (day && month && year && hours && minutes && seconds) {
        // Format thành 'YYYY-MM-DDTHH:mm:ss+07:00'
        receivedAt = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
      }
    }
  }
  // --- Fallback cho các trường hợp khác (hiếm gặp)
  else if (transactionData.date && transactionData.time) {
    const [day, month, year] = transactionData.date.split("/");
    const [hours, minutes, seconds] = transactionData.time.split(":");
    if (day && month && year && hours && minutes && seconds) {
      receivedAt = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
    }
  }
  // console.log("Will insert received_at =", receivedAt);

  // --- Gán reference
  const ref =
    transactionData.typeTrans === "com.mservice.momotransfer"
      ? transactionData.refMomo
      : transactionData.refVcb;

  // --- Gán amount
  const amount =
    transactionData.typeTrans === "com.mservice.momotransfer"
      ? parseAmount(transactionData.amountMomo)
      : parseAmount(transactionData.amountVcb);

  // --- Transaction type
  let transactionType = "credit";
  if (transactionData.transactionType === "-") {
    transactionType = "debit";
  } else if (transactionData.isMomoWithdrawal) {
    transactionType = "debit";
  }

  // --- Giao dịch test (nội bộ)
  const isTestTransaction =
    transactionData.accountNumber === "0071001027650" ||
    transactionData.refVcb?.toLowerCase().includes("test") ||
    transactionData.amountMomo?.includes("2,000") ||
    (amount && amount <= 2000);

  // --- Kết quả cuối cùng
  return {
    type_trans: transactionData.typeTrans,
    account_number: transactionData.accountNumber || null,
    amount: amount,
    currency: "VND",
    transaction_type: transactionType,
    balance: parseBalance(transactionData.balance),
    ref: ref,
    note: null,
    received_at: receivedAt,
    raw_body: rawBody,
    test_trans: isTestTransaction,
  };
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
    console.error(
      "❌ Discord webhook URLs not configured in environment variables"
    );
    return;
  }

  // Prepare common webhook payload
  const getWebhookPayload = (isAdmin = false) => {
    // Determine title based on transaction type
    const title =
      transactionData.typeTrans === "com.mservice.momotransfer"
        ? `${isAdmin ? "" : "✅ "}${transactionData.amountMomo} VND`
        : `${isAdmin ? "" : "✅ "}${transactionData.amountVcb} VND`;

    // Determine description based on transaction type
    const description =
      transactionData.typeTrans === "com.mservice.momotransfer"
        ? transactionData.refMomo
        : transactionData.refVcb +
          (transactionData.amountMomo === "2,000" && isAdmin
            ? "\nTest momo 2k"
            : "");

    // Get formatted date & time
    let authorText = "";
    if (
      transactionData.typeTrans === "com.mservice.momotransfer" &&
      transactionData.dateTimeMomo
    ) {
      const date = dayjs(Number(transactionData.dateTimeMomo)).tz(
        "Asia/Ho_Chi_Minh"
      );
      authorText = `${date.format("dd")}, ${date.format(
        "DD/MM/YYYY - HH:mm:ss"
      )}`;
    } else if (transactionData.date && transactionData.time) {
      const [day, month, year] = transactionData.date.split("/");
      const fullDateStr = `${year}-${month}-${day}T${transactionData.time}+07:00`;
      const date = dayjs(fullDateStr).tz("Asia/Ho_Chi_Minh");
      authorText = `${date.format("dd")}, ${date.format(
        "DD/MM/YYYY - HH:mm:ss"
      )}`;
    } else {
      authorText = `${transactionData.date || ""} - ${
        transactionData.time || ""
      }`;
    }

    // Determine color based on transaction type
    const color =
      transactionData.typeTrans === "com.mservice.momotransfer"
        ? "#ce007a"
        : "#007610";

    // Determine avatar URL based on transaction type
    const avatarUrl =
      transactionData.typeTrans === "com.mservice.momotransfer"
        ? "https://raw.githubusercontent.com/gaolamthuy/staff/refs/heads/main/public/icon/momo.png"
        : "https://raw.githubusercontent.com/gaolamthuy/staff/refs/heads/main/public/icon/vietcombank.png";

    // Determine username based on transaction type
    const username =
      transactionData.typeTrans === "com.mservice.momotransfer"
        ? "MOMO nhận chuyển khoản"
        : "VIETCOMBANK nhận chuyển khoản";

    // Footer text (chỉ khi có số dư/account)
    const footerText = `STK ${transactionData.accountNumber || ""} | Số dư: ${
      transactionData.balance || "N/A"
    }`;

    return {
      username,
      avatar_url: avatarUrl,
      embeds: [
        {
          title,
          description,
          author: {
            name: authorText,
          },
          color: parseInt(color.replace("#", ""), 16),
          footer:
            transactionData.typeTrans === "com.VCB"
              ? { text: footerText }
              : undefined,
        },
      ],
    };
  };

  try {
    // Always send to admin webhook
    await axios.post(adminWebhookUrl, getWebhookPayload(true));
    console.log("✅ Notification sent to admin webhook");

    // Send to shopstaff webhook if not a test transaction
    if (!isTestTransaction) {
      await axios.post(shopstaffWebhookUrl, getWebhookPayload(false));
      console.log("✅ Notification sent to shopstaff webhook");
    }
  } catch (error) {
    console.error("❌ Error sending webhook notification:", error);
    throw error;
  }
};

/**
 * Get recent payments from the database
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getRecentPayments = async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    // Get payments from database with pagination
    const {
      data: payments,
      error,
      count,
    } = await supabase
      .from("glt_payment")
      .select("*", { count: "exact" })
      .order("received_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) {
      console.error("❌ Error fetching payments:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching payment data",
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      count,
      data: payments,
    });
  } catch (error) {
    console.error("❌ Error in getRecentPayments:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  handleTransaction,
  getRecentPayments,
};
