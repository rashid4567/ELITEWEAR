const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../../model/userSchema");
const Wallet = require("../../model/walletScheema");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../utils/logger");

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    logger.error("Razorpay credentials missing");
    throw new Error(
      "Razorpay credentials missing. Please check environment variables."
    );
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const createWalletTopupOrder = async (req, res) => {
  try {
    const razorpayInstance = getRazorpayInstance();
    const userId = req.session.user || req.user._id;
    const { amount, description } = req.body;

    logger.info(
      `Creating wallet top-up order for user: ${userId}, Amount: ${amount}`
    );

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      logger.error(`Invalid amount for wallet top-up: ${amount}`);
      return res.status(400).json({
        success: false,
        message: "Please enter a valid amount",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User not found for wallet top-up: ${userId}`);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const amountInPaise = Math.round(parsedAmount * 100);
    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `wallet-topup-${Date.now()}`,
      payment_capture: 1,
      notes: {
        userId: userId.toString(),
        purpose: "wallet_topup",
        description: description || "Wallet top-up",
      },
    };

    logger.info(`Razorpay order options: ${JSON.stringify(options)}`);

    const razorpayOrder = await razorpayInstance.orders.create(options);
    logger.info(`Razorpay order created: ${razorpayOrder.id}`);

    req.session.walletTopup = {
      orderId: razorpayOrder.id,
      amount: parsedAmount,
      description: description || "Wallet top-up",
    };

    return res.status(200).json({
      success: true,
      order: razorpayOrder,
      key: process.env.RAZORPAY_KEY_ID,
      user: {
        name: user.fullname || user.username || "User",
        email: user.email || "",
        contact: user.mobile || "",
      },
    });
  } catch (error) {
    logger.error(`Error creating wallet top-up order: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to create payment order. Please try again.",
      details: error.message,
    });
  }
};

const verifyWalletTopupPayment = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    logger.info(`Verifying wallet top-up payment: ${razorpay_payment_id}`);

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      logger.error(
        `Invalid signature for wallet top-up: ${razorpay_payment_id}`
      );
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    const topupDetails = req.session.walletTopup;
    if (!topupDetails || topupDetails.orderId !== razorpay_order_id) {
      logger.error(
        `Invalid or missing session order details: ${JSON.stringify(
          topupDetails
        )}`
      );
      return res.status(400).json({
        success: false,
        message: "Invalid order details",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User not found for wallet top-up verification: ${userId}`);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.walletBalance === undefined) {
      user.walletBalance = 0;
    }

    const previousBalance = user.walletBalance;
    user.walletBalance += topupDetails.amount;

    await User.findByIdAndUpdate(userId, { walletBalance: user.walletBalance });
    logger.info(
      `User wallet balance updated from ${previousBalance} to ${user.walletBalance}`
    );

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      logger.info(`Creating new wallet for user: ${userId}`);
      wallet = new Wallet({
        userId,
        amount: user.walletBalance,
        transactions: [],
      });
    } else {
      wallet.amount = wallet.amount || 0;
      wallet.amount += topupDetails.amount;
    }

    const transactionRef = `RZPY-${uuidv4()}`;
    wallet.transactions.push({
      type: "credit",
      amount: topupDetails.amount,
      transactionRef,
      description: topupDetails.description,
      date: new Date(),
      status: "completed",
      metadata: {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      },
    });

    await wallet.save();
    logger.info(`Wallet top-up transaction added: ${transactionRef}`);

    delete req.session.walletTopup;

    return res.status(200).json({
      success: true,
      message: "Payment successful. Your wallet has been topped up.",
      walletBalance: user.walletBalance,
      previousBalance,
      topupAmount: topupDetails.amount,
      transactionRef,
    });
  } catch (error) {
    logger.error(`Error verifying wallet top-up payment: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed. Please contact support.",
      details: error.message,
    });
  }
};

const handleFailedWalletTopup = async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;
    logger.info(`Handling failed wallet top-up: ${razorpay_order_id}`);

    delete req.session.walletTopup;

    return res.status(200).json({
      success: true,
      message: "Payment failed. No changes were made to your wallet.",
    });
  } catch (error) {
    logger.error(`Error handling failed wallet top-up: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to process payment failure.",
      details: error.message,
    });
  }
};

module.exports = {
  createWalletTopupOrder,
  verifyWalletTopupPayment,
  handleFailedWalletTopup,
};
