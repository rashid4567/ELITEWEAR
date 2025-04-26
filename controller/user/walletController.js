const Wallet = require("../../model/walletScheema");
const User = require("../../model/userSchema");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../utils/logger");

/**
 * Get wallet details for the logged-in user
 */
const getwallet = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;

    // Find user without validation to avoid errors
    const user = await User.findById(userId).select("+walletBalance").lean();
    if (!user) {
      return res.status(404).render("error", { message: "User not found" });
    }

    // Initialize wallet balance if needed
    const walletBalance = user.walletBalance || 0;

    // Find or create wallet
    let wallet = await Wallet.findOne({ userId }).lean();
    if (!wallet) {
      // Create new wallet document without validation
      const newWallet = new Wallet({
        userId,
        amount: walletBalance,
        transactions: [],
      });
      wallet = await newWallet.save();
      wallet = wallet.toObject();
    }

    // Format transactions for display
    wallet.transactions = wallet.transactions.map((transaction) => ({
      ...transaction,
      formattedDate: transaction.date
        ? new Date(transaction.date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "N/A",
      typeDisplay:
        transaction.type === "credit" ? "Amount Credited" : "Amount Debited",
      isRefund:
        transaction.refundType !== null ||
        (transaction.transactionRef &&
          transaction.transactionRef.startsWith("REF-")),
      refundTypeDisplay: getRefundTypeDisplay(transaction.refundType),
    }));

    // Sort transactions by date (newest first)
    wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // ✅ Limit to only latest 8 transactions
    wallet.transactions = wallet.transactions.slice(0, 8);

    // Get refund statistics
    const refundStats = {
      totalRefunds: wallet.transactions.filter((t) => t.isRefund).length,
      totalRefundAmount: wallet.transactions
        .filter((t) => t.isRefund && t.type === "credit")
        .reduce((sum, t) => sum + t.amount, 0),
    };

    res.render("wallet", {
      wallet,
      user,
      walletBalance: walletBalance,
      refundStats,
      page: "wallet",
    });
  } catch (error) {
    logger.error("Error in getwallet:", error);
    res.status(500).render("error", { message: "Server issue" });
  }
};

/**
 * Helper function to get display text for refund types
 */
const getRefundTypeDisplay = (refundType) => {
  if (!refundType) return null;

  const displayMap = {
    order_refund: "Order Refund",
    item_refund: "Product Refund",
    cancellation_refund: "Cancellation Refund",
    manual_refund: "Manual Refund",
  };

  return displayMap[refundType] || "Refund";
};

/**
 * Credit wallet with specified amount
 */
const creditWallet = async (req, res) => {
  try {
    const { amount, description } = req.body;
    const userId = req.session.user || req.user._id;

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });
    }

    if (
      !description ||
      typeof description !== "string" ||
      description.trim() === ""
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Description is required" });
    }

    // Find user without validation
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Initialize wallet balance if needed
    if (user.walletBalance === undefined) {
      user.walletBalance = 0;
    }

    // Update wallet balance
    const previousBalance = user.walletBalance;
    user.walletBalance += parsedAmount;

    // Save with validation disabled
    await User.findByIdAndUpdate(userId, { walletBalance: user.walletBalance });

    // Update or create wallet document
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        $set: { amount: user.walletBalance },
        $push: {
          transactions: {
            type: "credit",
            amount: parsedAmount,
            transactionRef: `TXN-${uuidv4()}`,
            description: description.trim(),
            date: new Date(),
          },
        },
      },
      { new: true, upsert: true }
    );

    logger.info(`Wallet credited for user ${userId}`, {
      amount: parsedAmount,
      newBalance: user.walletBalance,
    });

    return res.status(200).json({
      success: true,
      message: "Wallet credited successfully",
      newBalance: user.walletBalance,
    });
  } catch (error) {
    logger.error("Error in creditWallet:", error);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

/**
 * Debit wallet with specified amount
 */
const debitWallet = async (req, res) => {
  try {
    const { amount, description } = req.body;
    const userId = req.session.user || req.user._id;

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });
    }

    if (
      !description ||
      typeof description !== "string" ||
      description.trim() === ""
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Description is required" });
    }

    // Find user without validation
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Initialize wallet balance if needed
    if (user.walletBalance === undefined) {
      user.walletBalance = 0;
    }

    if (user.walletBalance < parsedAmount) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient wallet balance" });
    }

    // Update wallet balance
    const previousBalance = user.walletBalance;
    user.walletBalance -= parsedAmount;

    // Save with validation disabled
    await User.findByIdAndUpdate(userId, { walletBalance: user.walletBalance });

    // Update or create wallet document
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        $set: { amount: user.walletBalance },
        $push: {
          transactions: {
            type: "debit",
            amount: parsedAmount,
            transactionRef: `TXN-${uuidv4()}`,
            description: description.trim(),
            date: new Date(),
          },
        },
      },
      { new: true, upsert: true }
    );

    logger.info(`Wallet debited for user ${userId}`, {
      amount: parsedAmount,
      newBalance: user.walletBalance,
    });

    return res.status(200).json({
      success: true,
      message: "Wallet debited successfully",
      newBalance: user.walletBalance,
    });
  } catch (error) {
    logger.error("Error in debitWallet:", error);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

/**
 * Process a refund to a user's wallet for a specific order item
 * @param {string} userId - The user ID
 * @param {string} orderItemId - The order item ID
 * @param {number} amount - The refund amount (optional, defaults to item total)
 * @param {string} reason - The reason for the refund
 * @param {string} adminId - The admin user ID processing the refund
 * @returns {Promise<Object>} - Result object with success status and additional data
 */
const processItemRefundToWallet = async (
  userId,
  orderItemId,
  amount = null,
  reason = null,
  adminId = null
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    logger.info(
      `Processing item refund for user ${userId}, item: ${orderItemId}`
    );

    // Input validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.error(`Invalid user ID: ${userId}`);
      throw new Error("Invalid user ID");
    }

    if (!orderItemId || !mongoose.Types.ObjectId.isValid(orderItemId)) {
      logger.error(`Invalid order item ID: ${orderItemId}`);
      throw new Error("Invalid order item ID");
    }

    // Find user without validation
    const user = await User.findById(userId).session(session);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      throw new Error("User not found");
    }

    // Find order item
    const orderItem = await OrderItem.findById(orderItemId)
      .populate("orderId")
      .session(session);

    if (!orderItem) {
      logger.error(`Order item not found: ${orderItemId}`);
      throw new Error("Order item not found");
    }

    // Check if item is already refunded
    if (orderItem.refunded) {
      logger.error(`Order item already refunded: ${orderItemId}`);
      throw new Error("This item has already been refunded");
    }

    // Determine refund amount
    let refundAmount = 0;

    if (amount !== null) {
      refundAmount = Number(amount);
      if (isNaN(refundAmount) || refundAmount <= 0) {
        logger.error(`Invalid specified refund amount: ${amount}`);
        throw new Error("Invalid refund amount specified");
      }
    } else if (
      orderItem.total_amount &&
      !isNaN(orderItem.total_amount) &&
      orderItem.total_amount > 0
    ) {
      refundAmount = orderItem.total_amount;
    } else if (orderItem.price && orderItem.quantity) {
      // Fallback calculation if total_amount is not available
      refundAmount = orderItem.price * orderItem.quantity;
    }

    if (isNaN(refundAmount) || refundAmount <= 0) {
      logger.error(
        `Could not determine valid refund amount for item: ${orderItemId}`
      );
      throw new Error("Could not determine a valid refund amount");
    }

    // Check if refund amount exceeds item total (only if amount is specified)
    if (
      amount !== null &&
      orderItem.total_amount &&
      refundAmount > orderItem.total_amount
    ) {
      logger.error(
        `Refund amount (${refundAmount}) exceeds item total (${orderItem.total_amount})`
      );
      throw new Error("Refund amount cannot exceed item total");
    }

    // Get order reference
    const orderNumber =
      orderItem.orderId.orderNumber || orderItem.orderId._id.toString();

    // Initialize wallet balance if needed
    if (user.walletBalance === undefined) {
      logger.info(`Initializing wallet balance for user: ${userId}`);
      user.walletBalance = 0;
    }

    // Update user wallet balance
    const previousBalance = user.walletBalance;
    user.walletBalance += refundAmount;

    // Save with validation disabled
    await User.findByIdAndUpdate(
      userId,
      { walletBalance: user.walletBalance },
      { session }
    );

    logger.info(
      `User wallet balance updated from ${previousBalance} to ${user.walletBalance}`
    );

    // Find or create wallet
    let wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      logger.info(`Creating new wallet for user: ${userId}`);
      wallet = new Wallet({
        userId,
        amount: user.walletBalance,
        transactions: [],
      });
    } else {
      wallet.amount = user.walletBalance;
    }

    // Generate transaction reference and description
    const transactionRef = `REF-ITEM-${uuidv4()}`;
    const refundDescription =
      reason ||
      `Refund for ${orderItem.product_name} from order #${orderNumber}`;

    // Add transaction to wallet
    wallet.transactions.push({
      type: "credit",
      amount: refundAmount,
      transactionRef,
      description: refundDescription,
      date: new Date(),
      orderReference: orderNumber,
      orderItemReference: orderItemId,
      productReference: orderItem.productId,
      refundType: "item_refund",
      status: "completed",
      metadata: {
        processedBy: adminId,
        originalAmount: orderItem.total_amount,
        partialRefund: refundAmount < orderItem.total_amount,
      },
    });

    await wallet.save({ session });
    logger.info(`Item refund transaction added to wallet: ${transactionRef}`);

    // Update order item
    orderItem.refunded = true;
    orderItem.refundAmount = refundAmount;
    orderItem.refundDate = new Date();
    orderItem.refundTransactionRef = transactionRef;
    orderItem.refundReason = reason || "Product return";
    orderItem.refundProcessedBy = adminId;
    orderItem.partialRefund = refundAmount < orderItem.total_amount;

    if (orderItem.status !== "Returned") {
      orderItem.status = "Returned";
      orderItem.statusHistory.push({
        status: "Returned",
        date: new Date(),
        note: `Item returned and refunded. Amount: ₹${refundAmount.toFixed(2)}`,
      });
    }

    await orderItem.save({ session });
    logger.info(`Order item marked as refunded: ${orderItemId}`);

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Return detailed result
    return {
      success: true,
      message: "Item refund processed successfully",
      walletBalance: user.walletBalance,
      previousBalance,
      refundAmount,
      transactionRef,
      userId: user._id,
      userName: user.fullname || user.name || "Customer",
      orderItemId,
      productName: orderItem.product_name,
      orderNumber,
      timestamp: new Date(),
    };
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();

    logger.error(`Failed to process item refund:`, error);
    return {
      success: false,
      message: error.message || "Failed to process refund",
      error: error.toString(),
      timestamp: new Date(),
    };
  }
};

/**
 * Process a refund to a user's wallet
 * @param {string} userId - The user ID
 * @param {number} amount - The refund amount
 * @param {string} orderNumber - The order number or reference
 * @param {string} reason - The reason for the refund
 * @returns {Promise<Object>} - Result object with success status and additional data
 */
const processRefundToWallet = async (userId, amount, orderNumber, reason) => {
  try {
    logger.info(
      `Processing refund for user ${userId}, amount: ${amount}, order: ${orderNumber}`
    );

    // Input validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.error(`Invalid user ID: ${userId}`);
      throw new Error("Invalid user ID");
    }

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      logger.error(`Invalid refund amount: ${amount}`);
      throw new Error("Invalid refund amount");
    }

    if (!orderNumber) {
      logger.error(`Missing order number`);
      throw new Error("Order number is required");
    }

    // Find user without validation
    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      throw new Error("User not found");
    }

    // Initialize wallet balance if needed
    if (user.walletBalance === undefined) {
      logger.info(`Initializing wallet balance for user: ${userId}`);
      user.walletBalance = 0;
    }

    // Store previous balance for logging
    const previousBalance = user.walletBalance || 0;

    // ADD to the wallet balance instead of replacing it
    user.walletBalance = previousBalance + parsedAmount;

    // Log the balance change
    logger.info(
      `User wallet balance updated from ${previousBalance} to ${user.walletBalance} (added ${parsedAmount})`
    );

    // Save with validation disabled
    await User.findByIdAndUpdate(userId, { walletBalance: user.walletBalance });

    // Find or create wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      logger.info(`Creating new wallet for user: ${userId}`);
      wallet = new Wallet({
        userId,
        amount: user.walletBalance, // Use the updated balance
        transactions: [],
      });
    } else {
      // Update wallet amount to match user's balance
      wallet.amount = user.walletBalance;
    }

    // Generate transaction reference and description
    const transactionRef = `REF-${uuidv4()}`;
    const refundDescription = reason
      ? `${reason} #${orderNumber}`
      : `Refund for order #${orderNumber}`;

    // Add transaction to wallet
    wallet.transactions.push({
      type: "credit",
      amount: parsedAmount,
      transactionRef,
      description: refundDescription,
      date: new Date(),
      orderReference: orderNumber,
      refundType: "order_refund",
    });

    await wallet.save();
    logger.info(`Refund transaction added to wallet: ${transactionRef}`);

    // Return detailed result
    return {
      success: true,
      message: "Refund processed successfully",
      walletBalance: user.walletBalance,
      previousBalance,
      refundAmount: parsedAmount,
      transactionRef,
      userId: user._id,
      userName: user.fullname || user.name || "Customer",
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error(`Failed to process refund:`, error);
    return {
      success: false,
      message: error.message || "Failed to process refund",
      error: error.toString(),
      timestamp: new Date(),
    };
  }
};

/**
 * Process a cancellation refund to a user's wallet
 * @param {string} userId - The user ID
 * @param {string} orderItemId - The order item ID
 * @param {string} reason - The reason for the cancellation
 * @returns {Promise<Object>} - Result object with success status and additional data
 */
const processCancellationRefund = async (userId, orderItemId, reason) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    logger.info(
      `Processing cancellation refund for user ${userId}, item: ${orderItemId}`
    );

    // Input validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.error(`Invalid user ID: ${userId}`);
      throw new Error("Invalid user ID");
    }

    if (!orderItemId || !mongoose.Types.ObjectId.isValid(orderItemId)) {
      logger.error(`Invalid order item ID: ${orderItemId}`);
      throw new Error("Invalid order item ID");
    }

    // Find user without validation
    const user = await User.findById(userId).session(session);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      throw new Error("User not found");
    }

    // Find order item
    const orderItem = await OrderItem.findById(orderItemId)
      .populate("orderId")
      .session(session);

    if (!orderItem) {
      logger.error(`Order item not found: ${orderItemId}`);
      throw new Error("Order item not found");
    }

    // Check if item is already refunded
    if (orderItem.refunded) {
      logger.error(`Order item already refunded: ${orderItemId}`);
      throw new Error("This item has already been refunded");
    }

    // Determine refund amount
    let refundAmount = 0;

    if (
      orderItem.total_amount &&
      !isNaN(orderItem.total_amount) &&
      orderItem.total_amount > 0
    ) {
      refundAmount = orderItem.total_amount;
    } else if (orderItem.price && orderItem.quantity) {
      // Fallback calculation if total_amount is not available
      refundAmount = orderItem.price * orderItem.quantity;
    }

    if (isNaN(refundAmount) || refundAmount <= 0) {
      logger.error(
        `Could not determine valid refund amount for item: ${orderItemId}`
      );
      throw new Error("Could not determine a valid refund amount");
    }

    // Get order reference
    const orderNumber =
      orderItem.orderId.orderNumber || orderItem.orderId._id.toString();

    // Initialize wallet balance if needed
    if (user.walletBalance === undefined) {
      logger.info(`Initializing wallet balance for user: ${userId}`);
      user.walletBalance = 0;
    }

    // Update user wallet balance
    const previousBalance = user.walletBalance;
    user.walletBalance += refundAmount;

    // Save with validation disabled
    await User.findByIdAndUpdate(
      userId,
      { walletBalance: user.walletBalance },
      { session }
    );

    logger.info(
      `User wallet balance updated from ${previousBalance} to ${user.walletBalance}`
    );

    // Find or create wallet
    let wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      logger.info(`Creating new wallet for user: ${userId}`);
      wallet = new Wallet({
        userId,
        amount: user.walletBalance,
        transactions: [],
      });
    } else {
      wallet.amount = user.walletBalance;
    }

    // Generate transaction reference and description
    const transactionRef = `REF-CANCEL-${uuidv4()}`;
    const refundDescription = `Refund for cancelled item: ${orderItem.product_name} from order #${orderNumber}`;

    // Add transaction to wallet
    wallet.transactions.push({
      type: "credit",
      amount: refundAmount,
      transactionRef,
      description: refundDescription,
      date: new Date(),
      orderReference: orderNumber,
      orderItemReference: orderItemId,
      productReference: orderItem.productId,
      refundType: "cancellation_refund",
      status: "completed",
      metadata: {
        cancellationReason: reason || "Order cancelled",
      },
    });

    await wallet.save({ session });
    logger.info(
      `Cancellation refund transaction added to wallet: ${transactionRef}`
    );

    // Update order item
    orderItem.refunded = true;
    orderItem.refundAmount = refundAmount;
    orderItem.refundDate = new Date();
    orderItem.refundTransactionRef = transactionRef;
    orderItem.cancelReason = reason || "Order cancelled";
    orderItem.cancelledAt = new Date();

    if (orderItem.status !== "Cancelled") {
      orderItem.status = "Cancelled";
      orderItem.statusHistory.push({
        status: "Cancelled",
        date: new Date(),
        note: `Item cancelled and refunded. Amount: ₹${refundAmount.toFixed(
          2
        )}`,
      });
    }

    await orderItem.save({ session });
    logger.info(`Order item marked as cancelled and refunded: ${orderItemId}`);

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Return detailed result
    return {
      success: true,
      message: "Cancellation refund processed successfully",
      walletBalance: user.walletBalance,
      previousBalance,
      refundAmount,
      transactionRef,
      userId: user._id,
      userName: user.fullname || user.name || "Customer",
      orderItemId,
      productName: orderItem.product_name,
      orderNumber,
      timestamp: new Date(),
    };
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();

    logger.error(`Failed to process cancellation refund:`, error);
    return {
      success: false,
      message: error.message || "Failed to process cancellation refund",
      error: error.toString(),
      timestamp: new Date(),
    };
  }
};

/**
 * Get wallet balance for a user
 * @param {string} userId - The user ID
 * @returns {Promise<number>} - The wallet balance
 */
const getWalletBalance = async (userId) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }

    const user = await User.findById(userId).select("+walletBalance").lean();
    if (!user) {
      return 0;
    }

    return user.walletBalance || 0;
  } catch (error) {
    logger.error(`Error getting wallet balance:`, error);
    throw error;
  }
};

/**
 * Get refund transactions for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} - Array of refund transactions
 */
const getRefundTransactions = async (userId) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return [];
    }

    // Filter only refund transactions
    const refundTransactions = wallet.transactions.filter(
      (transaction) =>
        transaction.refundType !== null ||
        (transaction.transactionRef &&
          transaction.transactionRef.startsWith("REF-"))
    );

    // Sort by date (newest first)
    refundTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    return refundTransactions;
  } catch (error) {
    logger.error(`Error getting refund transactions:`, error);
    throw error;
  }
};

/**
 * Get refund details for a specific order item
 * @param {string} orderItemId - The order item ID
 * @returns {Promise<Object>} - Refund details
 */
const getItemRefundDetails = async (orderItemId) => {
  try {
    if (!orderItemId || !mongoose.Types.ObjectId.isValid(orderItemId)) {
      throw new Error("Invalid order item ID");
    }

    const orderItem = await OrderItem.findById(orderItemId)
      .populate("orderId")
      .populate("productId")
      .lean();

    if (!orderItem) {
      throw new Error("Order item not found");
    }

    if (!orderItem.refunded) {
      return {
        refunded: false,
        orderItem,
      };
    }

    // Find the refund transaction
    const wallet = await Wallet.findOne({
      "transactions.orderItemReference": orderItemId,
    }).lean();

    if (!wallet) {
      return {
        refunded: true,
        orderItem,
        transactionFound: false,
      };
    }

    // Find the specific transaction for this refund
    const refundTransaction = wallet.transactions.find(
      (t) =>
        t.orderItemReference &&
        t.orderItemReference.toString() === orderItemId.toString()
    );

    return {
      refunded: true,
      orderItem,
      transactionFound: !!refundTransaction,
      transaction: refundTransaction,
      walletId: wallet._id,
      userId: wallet.userId,
    };
  } catch (error) {
    logger.error(`Error getting item refund details:`, error);
    throw error;
  }
};

module.exports = {
  getwallet,
  creditWallet,
  debitWallet,
  processRefundToWallet,
  processItemRefundToWallet,
  processCancellationRefund,
  getWalletBalance,
  getRefundTransactions,
  getItemRefundDetails,
};
