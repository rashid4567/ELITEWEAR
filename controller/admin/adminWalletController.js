const User = require("../../model/userSchema");
const Wallet = require("../../model/walletScheema");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const Product = require("../../model/productScheema");
const mongoose = require("mongoose");
const { processItemRefundToWallet } = require("../user/walletController");

const getAllWalletTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      search = "",
      sort = "date",
      order = "desc",
      timeRange = "all",
    } = req.query;

    const query = {};

    if (type && ["credit", "debit"].includes(type)) {
      query["transactions.type"] = type;
    }

    if (search) {
      const users = await User.find({
        $or: [
          { email: { $regex: search, $options: "i" } },
          { fullname: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      if (users.length > 0) {
        query.userId = { $in: users.map((user) => user._id) };
      } else {
        return res.render("admin-wallet-transactions", {
          transactions: [],
          currentPage: 1,
          totalPages: 0,
          totalTransactions: 0,
          filters: {
            type,
            search,
            sort,
            order,
            timeRange,
            limit: Number(limit),
          },
        });
      }
    }

    if (timeRange !== "all") {
      const now = new Date();
      let startDate;

      switch (timeRange) {
        case "24h":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = null;
      }

      if (startDate) {
        query["transactions.date"] = { $gte: startDate };
      }
    }

    const totalWallets = await Wallet.countDocuments(query);

    const wallets = await Wallet.find(query)
      .populate("userId", "fullname email")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    let allTransactions = [];

    for (const wallet of wallets) {
      const userTransactions = wallet.transactions.map((transaction) => ({
        ...transaction,
        userId: wallet.userId._id,
        userFullname: wallet.userId.fullname,
        userEmail: wallet.userId.email,
        walletBalance: wallet.amount,
        formattedDate: new Date(transaction.date).toLocaleString(),
        isRefund:
          transaction.refundType !== null ||
          (transaction.transactionRef &&
            transaction.transactionRef.startsWith("REF-")),
        refundTypeDisplay: getRefundTypeDisplay(transaction.refundType),
      }));

      allTransactions = [...allTransactions, ...userTransactions];
    }

    const sortField = sort === "amount" ? "amount" : "date";
    const sortOrder = order === "asc" ? 1 : -1;

    allTransactions.sort((a, b) => {
      if (sortField === "amount") {
        return (a.amount - b.amount) * sortOrder;
      }
      return (new Date(a.date) - new Date(b.date)) * sortOrder;
    });

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + Number(limit);
    const paginatedTransactions = allTransactions.slice(startIndex, endIndex);

    const totalTransactions = allTransactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);

    res.render("admin-wallet-transactions", {
      transactions: paginatedTransactions,
      currentPage: Number(page),
      totalPages,
      totalTransactions,
      filters: { type, search, sort, order, timeRange, limit: Number(limit) },
    });
  } catch (error) {
    console.error("Error fetching wallet transactions:", error);
    res.status(500).render("error", { message: "Internal server error" });
  }
};

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

const getRefundTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sort = "date",
      order = "desc",
      timeRange = "all",
      refundType = "all",
    } = req.query;

    const pipeline = [
      {
        $unwind: "$transactions",
      },
      {
        $match: {
          $or: [
            { "transactions.refundType": { $ne: null } },
            { "transactions.transactionRef": { $regex: "^REF-" } },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
    ];

    if (refundType !== "all") {
      pipeline.push({
        $match: {
          "transactions.refundType": refundType,
        },
      });
    }

    if (timeRange !== "all") {
      const now = new Date();
      let startDate;

      switch (timeRange) {
        case "24h":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = null;
      }

      if (startDate) {
        pipeline.push({
          $match: {
            "transactions.date": { $gte: startDate },
          },
        });
      }
    }

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "user.email": { $regex: search, $options: "i" } },
            { "user.fullname": { $regex: search, $options: "i" } },
            { "transactions.description": { $regex: search, $options: "i" } },
            {
              "transactions.transactionRef": { $regex: search, $options: "i" },
            },
            {
              "transactions.orderReference": { $regex: search, $options: "i" },
            },
          ],
        },
      });
    }

    pipeline.push({
      $lookup: {
        from: "orderitems",
        localField: "transactions.orderItemReference",
        foreignField: "_id",
        as: "orderItem",
      },
    });

    pipeline.push({
      $project: {
        _id: 0,
        userId: "$user._id",
        userFullname: "$user.fullname",
        userEmail: "$user.email",
        walletBalance: "$amount",
        transactionId: "$transactions._id",
        type: "$transactions.type",
        amount: "$transactions.amount",
        transactionRef: "$transactions.transactionRef",
        description: "$transactions.description",
        date: "$transactions.date",
        formattedDate: {
          $dateToString: {
            format: "%Y-%m-%d %H:%M:%S",
            date: "$transactions.date",
          },
        },
        orderReference: "$transactions.orderReference",
        orderItemReference: "$transactions.orderItemReference",
        productReference: "$transactions.productReference",
        refundType: "$transactions.refundType",
        refundTypeDisplay: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$transactions.refundType", "order_refund"] },
                then: "Order Refund",
              },
              {
                case: { $eq: ["$transactions.refundType", "item_refund"] },
                then: "Product Refund",
              },
              {
                case: {
                  $eq: ["$transactions.refundType", "cancellation_refund"],
                },
                then: "Cancellation Refund",
              },
              {
                case: { $eq: ["$transactions.refundType", "manual_refund"] },
                then: "Manual Refund",
              },
            ],
            default: "Refund",
          },
        },
        status: "$transactions.status",
        metadata: "$transactions.metadata",
        productName: { $arrayElemAt: ["$orderItem.product_name", 0] },
        productSize: { $arrayElemAt: ["$orderItem.size", 0] },
        productImage: { $arrayElemAt: ["$orderItem.itemImage", 0] },
      },
    });

    // Add sorting
    const sortField = sort === "amount" ? "amount" : "date";
    const sortOrder = order === "asc" ? 1 : -1;

    pipeline.push({
      $sort: {
        [sortField]: sortOrder,
      },
    });

    const refunds = await Wallet.aggregate(pipeline);

    const totalRefunds = refunds.length;
    const totalPages = Math.ceil(totalRefunds / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + Number(limit);
    const paginatedRefunds = refunds.slice(startIndex, endIndex);

    const refundTypeStats = await Wallet.aggregate([
      { $unwind: "$transactions" },
      {
        $match: {
          $or: [
            { "transactions.refundType": { $ne: null } },
            { "transactions.transactionRef": { $regex: "^REF-" } },
          ],
        },
      },
      {
        $group: {
          _id: "$transactions.refundType",
          count: { $sum: 1 },
          totalAmount: { $sum: "$transactions.amount" },
        },
      },
    ]);

    res.render("admin-refund-transactions", {
      refunds: paginatedRefunds,
      currentPage: Number(page),
      totalPages,
      totalRefunds,
      refundTypeStats,
      filters: {
        search,
        sort,
        order,
        timeRange,
        refundType,
        limit: Number(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching refund transactions:", error);
    res.status(500).render("error", { message: "Internal server error" });
  }
};

const getUserWallet = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).render("error", { message: "Invalid user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).render("error", { message: "User not found" });
    }

    const wallet = await Wallet.findOne({ userId }).lean();
    if (!wallet) {
      return res.render("admin-user-wallet", {
        user,
        wallet: { amount: 0, transactions: [] },
        hasTransactions: false,
      });
    }

    const transactions = wallet.transactions.map((transaction) => ({
      ...transaction,
      formattedDate: new Date(transaction.date).toLocaleString(),
      isRefund:
        transaction.refundType !== null ||
        (transaction.transactionRef &&
          transaction.transactionRef.startsWith("REF-")),
      typeDisplay:
        transaction.type === "credit" ? "Amount Credited" : "Amount Debited",
      refundTypeDisplay: getRefundTypeDisplay(transaction.refundType),
    }));

    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const stats = {
      totalCredits: transactions.filter((t) => t.type === "credit").length,
      totalDebits: transactions.filter((t) => t.type === "debit").length,
      totalCreditAmount: transactions
        .filter((t) => t.type === "credit")
        .reduce((sum, t) => sum + t.amount, 0),
      totalDebitAmount: transactions
        .filter((t) => t.type === "debit")
        .reduce((sum, t) => sum + t.amount, 0),
      totalRefunds: transactions.filter((t) => t.isRefund).length,
      totalRefundAmount: transactions
        .filter((t) => t.isRefund)
        .reduce((sum, t) => sum + t.amount, 0),
    };

    res.render("admin-user-wallet", {
      user,
      wallet: { ...wallet, transactions },
      hasTransactions: transactions.length > 0,
      stats,
    });
  } catch (error) {
    console.error("Error fetching user wallet:", error);
    res.status(500).render("error", { message: "Internal server error" });
  }
};

const getRefundStatistics = async (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;

    const now = new Date();
    let startDate;

    switch (timeRange) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const refundStats = await Wallet.aggregate([
      {
        $unwind: "$transactions",
      },
      {
        $match: {
          $or: [
            { "transactions.refundType": { $ne: null } },
            { "transactions.transactionRef": { $regex: "^REF-" } },
          ],
          "transactions.date": { $gte: startDate },
          "transactions.type": "credit",
        },
      },
      {
        $group: {
          _id: null,
          totalRefundAmount: { $sum: "$transactions.amount" },
          refundCount: { $sum: 1 },
          averageRefundAmount: { $avg: "$transactions.amount" },
        },
      },
    ]);

    const refundTypeStats = await Wallet.aggregate([
      {
        $unwind: "$transactions",
      },
      {
        $match: {
          $or: [
            { "transactions.refundType": { $ne: null } },
            { "transactions.transactionRef": { $regex: "^REF-" } },
          ],
          "transactions.date": { $gte: startDate },
          "transactions.type": "credit",
        },
      },
      {
        $group: {
          _id: "$transactions.refundType",
          count: { $sum: 1 },
          totalAmount: { $sum: "$transactions.amount" },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const refundReasons = await OrderItem.aggregate([
      {
        $match: {
          refunded: true,
          refundDate: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$returnReason",
          count: { $sum: 1 },
          totalAmount: { $sum: "$refundAmount" },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 5,
      },
    ]);

    const dailyRefunds = await Wallet.aggregate([
      {
        $unwind: "$transactions",
      },
      {
        $match: {
          $or: [
            { "transactions.refundType": { $ne: null } },
            { "transactions.transactionRef": { $regex: "^REF-" } },
          ],
          "transactions.date": { $gte: startDate },
          "transactions.type": "credit",
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$transactions.date" },
          },
          totalAmount: { $sum: "$transactions.amount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    res.render("admin-refund-statistics", {
      refundStats: refundStats[0] || {
        totalRefundAmount: 0,
        refundCount: 0,
        averageRefundAmount: 0,
      },
      refundTypeStats,
      refundReasons,
      dailyRefunds,
      timeRange,
    });
  } catch (error) {
    console.error("Error fetching refund statistics:", error);
    res.status(500).render("error", { message: "Internal server error" });
  }
};

const processManualRefund = async (req, res) => {
  try {
    const { orderItemId, amount, reason } = req.body;
    const adminId = req.session.admin._id;

    if (!orderItemId || !mongoose.Types.ObjectId.isValid(orderItemId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order item ID" });
    }

    const orderItem = await OrderItem.findById(orderItemId).populate({
      path: "orderId",
      populate: { path: "userId" },
    });

    if (!orderItem) {
      return res
        .status(404)
        .json({ success: false, message: "Order item not found" });
    }

    if (orderItem.refunded) {
      return res
        .status(400)
        .json({
          success: false,
          message: "This item has already been refunded",
        });
    }

    const userId = orderItem.orderId.userId._id;
    const parsedAmount = amount ? Number(amount) : orderItem.total_amount;

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid refund amount" });
    }

    if (parsedAmount > orderItem.total_amount) {
      return res.status(400).json({
        success: false,
        message: `Refund amount (₹${parsedAmount.toFixed(
          2
        )}) cannot exceed item total (₹${orderItem.total_amount.toFixed(2)})`,
      });
    }

    const refundResult = await processItemRefundToWallet(
      userId,
      orderItemId,
      parsedAmount,
      reason || "Manual refund by admin",
      adminId
    );

    if (!refundResult.success) {
      return res.status(500).json({
        success: false,
        message: refundResult.message || "Failed to process refund",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      refundAmount: refundResult.refundAmount,
      walletBalance: refundResult.walletBalance,
      userName: refundResult.userName,
      transactionRef: refundResult.transactionRef,
    });
  } catch (error) {
    console.error("Error processing manual refund:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getRefundDetails = async (req, res) => {
  try {
    const { transactionRef } = req.params;

    if (!transactionRef) {
      return res
        .status(400)
        .json({ success: false, message: "Transaction reference is required" });
    }

    const wallet = await Wallet.findOne({
      "transactions.transactionRef": transactionRef,
    }).populate("userId");

    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    const transaction = wallet.transactions.find(
      (t) => t.transactionRef === transactionRef
    );

    if (!transaction) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    let orderItem = null;
    let order = null;
    let product = null;

    if (transaction.orderItemReference) {
      orderItem = await OrderItem.findById(
        transaction.orderItemReference
      ).lean();

      if (orderItem) {
        order = await Order.findById(orderItem.orderId).lean();

        if (transaction.productReference) {
          product = await Product.findById(transaction.productReference).lean();
        }
      }
    }

    res.status(200).json({
      success: true,
      transaction: {
        ...transaction,
        formattedDate: new Date(transaction.date).toLocaleString(),
        refundTypeDisplay: getRefundTypeDisplay(transaction.refundType),
      },
      user: wallet.userId,
      orderItem,
      order,
      product,
    });
  } catch (error) {
    console.error("Error fetching refund details:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  getAllWalletTransactions,
  getRefundTransactions,
  getUserWallet,
  getRefundStatistics,
  processManualRefund,
  getRefundDetails,
};
