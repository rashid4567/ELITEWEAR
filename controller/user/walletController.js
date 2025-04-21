const Wallet = require("../../model/walletScheema");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const getwallet = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.user._id }).lean();
    if (!wallet) {
      wallet = await new Wallet({ userId: req.user._id, amount: 0, transactions: [] }).save();
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
      user: req.user,
    });
  } catch (error) {
    console.error("Error in getwallet:", error.message);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

const creditWallet = async (req, res) => {
  try {
    const { amount, description } = req.body;

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    if (!description || typeof description !== "string" || description.trim() === "") {
      return res.status(400).json({ success: false, message: "Description is required" });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user._id },
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

    return res.status(200).json({
      success: true,
      message: "Wallet credited successfully",
      newBalance: wallet.amount,
    });
  } catch (error) {
    console.error("Error in creditWallet:", error.message);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

const debitWallet = async (req, res) => {
  try {
    const { amount, description } = req.body;

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    if (!description || typeof description !== "string" || description.trim() === "") {
      return res.status(400).json({ success: false, message: "Description is required" });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }

    if (wallet.amount < parsedAmount) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId: req.user._id, amount: { $gte: parsedAmount } },
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

module.exports = {
  getwallet,
  creditWallet,
  debitWallet,
};