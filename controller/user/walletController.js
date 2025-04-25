const Wallet = require("../../model/walletScheema");
const User = require("../../model/userSchema");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const getwallet = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).render("page-500", { message: "User not found" });
    }

    if (user.walletBalance === undefined) {
      user.walletBalance = 0;
      await user.save();
    }

    let wallet = await Wallet.findOne({ userId }).lean();
    if (!wallet) {
      wallet = await new Wallet({
        userId,
        amount: user.walletBalance,
        transactions: [],
      }).save();
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
      typeDisplay:
        transaction.type === "credit" ? "Amount Credited" : "Amount Debited",
    }));

    res.render("wallet", {
      wallet,
      user,
      walletBalance: user.walletBalance || 0,
      page: "wallet",
    });
  } catch (error) {
    console.error("Error in getwallet:", error.message);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

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

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.walletBalance === undefined) {
      user.walletBalance = 0;
    }

    user.walletBalance += parsedAmount;
    await user.save();

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

    return res.status(200).json({
      success: true,
      message: "Wallet credited successfully",
      newBalance: user.walletBalance,
    });
  } catch (error) {
    console.error("Error in creditWallet:", error.message);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

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

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.walletBalance === undefined) {
      user.walletBalance = 0;
    }

    if (user.walletBalance < parsedAmount) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient wallet balance" });
    }

    user.walletBalance -= parsedAmount;
    await user.save();

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

    return res.status(200).json({
      success: true,
      message: "Wallet debited successfully",
      newBalance: user.walletBalance,
    });
  } catch (error) {
    console.error("Error in debitWallet:", error.message);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

const processRefundToWallet = async (userId, amount, orderNumber, reason) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.walletBalance === undefined) {
      user.walletBalance = 0;
    }

    user.walletBalance += amount;
    await user.save();

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({
        userId,
        amount: amount,
        transactions: [],
      });
    } else {
      wallet.amount = user.walletBalance;
    }

    wallet.transactions.push({
      type: "credit",
      amount: amount,
      transactionRef: `REF-${uuidv4()}`,
      description: `${reason} #${orderNumber}`,
      date: new Date(),
    });

    await wallet.save();
    return true;
  } catch (error) {
    console.error("Error processing refund to wallet:", error);
    return false;
  }
};

module.exports = {
  getwallet,
  creditWallet,
  debitWallet,
  processRefundToWallet,
};
