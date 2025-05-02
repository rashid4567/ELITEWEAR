const Wallet = require("../../model/walletScheema");
const User = require("../../model/userSchema");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid"); 

<<<<<<< Updated upstream
const getwallet = async (req, res) => {
  try {
    const userId = req.user?.id || req.session.user?._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).render("page-401", { message: "Unauthorized access" });
    }

    let wallet = await Wallet.findOne({ userId }).lean();
    if (!wallet) {
      wallet = await new Wallet({ userId, amount: 0, transactions: [] }).save();
      wallet = wallet.toObject();
    }

    wallet.transactions = wallet.transactions.map((transaction) => ({
      ...transaction,
      formattedDate: transaction.date
        ? new Date(transaction.date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "N/A",
      typeDisplay: transaction.type === "credit" ? "Amount Credited" : "Amount Debited",
    }));

    res.render("wallet", {
      wallet,
      user: req.user || req.session.user,
    });
  } catch (error) {
    console.error("Error in getwallet:", error.message);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};
=======
  const getwallet = async (req, res) => {
    try {
      const userId = req.session.user || req.user._id;
      const page = parseInt(req.query.page) || 1;
      const limit = 8;
      const skip = (page - 1) * limit;

      const user = await User.findById(userId).select("+walletBalance").lean();
      if (!user) {
        return res.status(404).render("error", { message: "User not found" });
      }

      const walletBalance = user.walletBalance || 0;

      let wallet = await Wallet.findOne({ userId }).lean();
      if (!wallet) {
        const newWallet = new Wallet({
          userId,
          amount: walletBalance,
          transactions: [],
        });
        wallet = await newWallet.save();
        wallet = wallet.toObject();
      }


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


      wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

      const totalTransactions = wallet.transactions.length;
      const totalPages = Math.ceil(totalTransactions / limit);


      wallet.transactions = wallet.transactions.slice(skip, skip + limit);

      const refundStats = {
        totalRefunds: wallet.transactions.filter((t) => t.isRefund).length,
        totalRefundAmount: wallet.transactions
          .filter((t) => t.isRefund && t.type === "credit")
          .reduce((sum, t) => sum + t.amount, 0),
      };

      res.render("wallet", {
        wallet,
        user,
        walletBalance,
        refundStats,
        currentPage: page,
        totalPages,
        page: "wallet",
      });
    } catch (error) {
      logger.error("Error in getwallet:", error);
      res.status(500).render("error", { message: "Server issue" });
    }
  };
>>>>>>> Stashed changes

const creditWallet = async (req, res) => {
  try {
    const userId = req.user?._id || req.session.user?._id;
    const { amount, description } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    if (!description || typeof description !== "string" || description.trim() === "") {
      return res.status(400).json({ success: false, message: "Description is required" });
    }

<<<<<<< Updated upstream
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        $inc: { amount: parsedAmount },
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
=======
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }


    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
     
      const newWallet = new Wallet({
        userId,
        amount: parsedAmount,
        transactions: [{
          type: "credit",
          amount: parsedAmount,
          transactionRef: `TXN-${uuidv4()}`,
          description: description.trim(),
          date: new Date(),
        }],
      });
      await newWallet.save();

      return res.status(200).json({
        success: true,
        message: "Wallet credited successfully",
        newBalance: newWallet.amount,
      });
    }

  
    wallet.amount += parsedAmount;

    wallet.transactions.push({
      type: "credit",
      amount: parsedAmount,
      transactionRef: `TXN-${uuidv4()}`,
      description: description.trim(),
      date: new Date(),
    });

  
    await wallet.save();
>>>>>>> Stashed changes

    return res.status(200).json({
      success: true,
      message: "Wallet credited successfully",
      newBalance: wallet.amount,
    });
  } catch (error) {
<<<<<<< Updated upstream
    console.error("Error in creditWallet:", error.message);
=======
    console.error("Error in creditWallet:", error);
>>>>>>> Stashed changes
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};


const debitWallet = async (req, res) => {
  try {
    const userId = req.user?._id || req.session.user?._id;
    const { amount, description } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    if (!description || typeof description !== "string" || description.trim() === "") {
      return res.status(400).json({ success: false, message: "Description is required" });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }

    if (wallet.amount < parsedAmount) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId, amount: { $gte: parsedAmount } },
      {
        $inc: { amount: -parsedAmount },
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
      { new: true }
    );

    if (!updatedWallet) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance or wallet not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Wallet debited successfully",
      newBalance: updatedWallet.amount,
    });
  } catch (error) {
    console.error("Error in debitWallet:", error.message);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

<<<<<<< Updated upstream
=======
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

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.error(`Invalid user ID: ${userId}`);
      throw new Error("Invalid user ID");
    }

    if (!orderItemId || !mongoose.Types.ObjectId.isValid(orderItemId)) {
      logger.error(`Invalid order item ID: ${orderItemId}`);
      throw new Error("Invalid order item ID");
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      throw new Error("User not found");
    }

    const orderItem = await OrderItem.findById(orderItemId)
      .populate("orderId")
      .session(session);

    if (!orderItem) {
      logger.error(`Order item not found: ${orderItemId}`);
      throw new Error("Order item not found");
    }

    if (orderItem.refunded) {
      logger.error(`Order item already refunded: ${orderItemId}`);
      throw new Error("This item has already been refunded");
    }

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
      refundAmount = orderItem.price * orderItem.quantity;
    }

    if (isNaN(refundAmount) || refundAmount <= 0) {
      logger.error(
        `Could not determine valid refund amount for item: ${orderItemId}`
      );
      throw new Error("Could not determine a valid refund amount");
    }

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

    const orderNumber =
      orderItem.orderId.orderNumber || orderItem.orderId._id.toString();

    if (user.walletBalance === undefined) {
      logger.info(`Initializing wallet balance for user: ${userId}`);
      user.walletBalance = 0;
    }

    const previousBalance = user.walletBalance;
    user.walletBalance += refundAmount;

    await User.findByIdAndUpdate(
      userId,
      { walletBalance: user.walletBalance },
      { session }
    );

    logger.info(
      `User wallet balance updated from ${previousBalance} to ${user.walletBalance}`
    );

    let wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      logger.info(`Creating new wallet for user: ${userId}`);
      wallet = new Wallet({
        userId,
        amount: user.walletBalance,
        transactions: [],
      });
    } else {
      wallet.amount += refundAmount;

    }

    const transactionRef = `REF-ITEM-${uuidv4()}`;
    const refundDescription =
      reason ||
      `Refund for ${orderItem.product_name} from order #${orderNumber}`;

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

    await session.commitTransaction();
    session.endSession();

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

const processRefundToWallet = async (userId, amount, orderNumber, reason) => {
  try {
    logger.info(
      `Processing refund for user ${userId}, amount: ${amount}, order: ${orderNumber}`
    );

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

    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      throw new Error("User not found");
    }

    if (user.walletBalance === undefined) {
      logger.info(`Initializing wallet balance for user: ${userId}`);
      user.walletBalance = 0;
    }

    const previousBalance = user.walletBalance || 0;

    user.walletBalance = previousBalance + parsedAmount;

    logger.info(
      `User wallet balance updated from ${previousBalance} to ${user.walletBalance} (added ${parsedAmount})`
    );

    await User.findByIdAndUpdate(userId, { walletBalance: user.walletBalance });

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      logger.info(`Creating new wallet for user: ${userId}`);
      wallet = new Wallet({
        userId,
        amount: user.walletBalance,
        transactions: [],
      });
    } else {
      wallet.amount += user.walletBalance;
    }

    const transactionRef = `REF-${uuidv4()}`;
    const refundDescription = reason
      ? `${reason} #${orderNumber}`
      : `Refund for order #${orderNumber}`;

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

const processCancellationRefund = async (userId, orderItemId, reason) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    logger.info(
      `Processing cancellation refund for user ${userId}, item: ${orderItemId}`
    );

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.error(`Invalid user ID: ${userId}`);
      throw new Error("Invalid user ID");
    }

    if (!orderItemId || !mongoose.Types.ObjectId.isValid(orderItemId)) {
      logger.error(`Invalid order item ID: ${orderItemId}`);
      throw new Error("Invalid order item ID");
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      throw new Error("User not found");
    }

    const orderItem = await OrderItem.findById(orderItemId)
      .populate("orderId")
      .session(session);

    if (!orderItem) {
      logger.error(`Order item not found: ${orderItemId}`);
      throw new Error("Order item not found");
    }

    if (orderItem.refunded) {
      logger.error(`Order item already refunded: ${orderItemId}`);
      throw new Error("This item has already been refunded");
    }

    let refundAmount = 0;

    if (
      orderItem.total_amount &&
      !isNaN(orderItem.total_amount) &&
      orderItem.total_amount > 0
    ) {
      refundAmount = orderItem.total_amount;
    } else if (orderItem.price && orderItem.quantity) {
      refundAmount = orderItem.price * orderItem.quantity;
    }

    if (isNaN(refundAmount) || refundAmount <= 0) {
      logger.error(
        `Could not determine valid refund amount for item: ${orderItemId}`
      );
      throw new Error("Could not determine a valid refund amount");
    }

    const orderNumber =
      orderItem.orderId.orderNumber || orderItem.orderId._id.toString();

    if (user.walletBalance === undefined) {
      logger.info(`Initializing wallet balance for user: ${userId}`);
      user.walletBalance = 0;
    }

    const previousBalance = user.walletBalance;
    user.walletBalance += refundAmount;

    await User.findByIdAndUpdate(
      userId,
      { walletBalance: user.walletBalance },
      { session }
    );

    logger.info(
      `User wallet balance updated from ${previousBalance} to ${user.walletBalance}`
    );

    let wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      logger.info(`Creating new wallet for user: ${userId}`);
      wallet = new Wallet({
        userId,
        amount: user.walletBalance,
        transactions: [],
      });
    } else {
      wallet.amount += user.walletBalance;
    }

    const transactionRef = `REF-CANCEL-${uuidv4()}`;
    const refundDescription = `Refund for cancelled item: ${orderItem.product_name} from order #${orderNumber}`;

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

    await session.commitTransaction();
    session.endSession();

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

const getRefundTransactions = async (userId) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return [];
    }

    const refundTransactions = wallet.transactions.filter(
      (transaction) =>
        transaction.refundType !== null ||
        (transaction.transactionRef &&
          transaction.transactionRef.startsWith("REF-"))
    );

    refundTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    return refundTransactions;
  } catch (error) {
    logger.error(`Error getting refund transactions:`, error);
    throw error;
  }
};

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

>>>>>>> Stashed changes
module.exports = {
  getwallet,
  creditWallet,
  debitWallet,
};