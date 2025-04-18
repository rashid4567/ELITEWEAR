const mongoose = require("mongoose");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const User = require("../../model/userSchema");
const Product = require("../../model/productScheema");
const Wallet = require("../../model/walletScheema");
const { v4: uuidv4 } = require("uuid");

const getorderController = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "All",
      search = "",
      sort = "createdAt",
      order = "desc",
      timeRange = "all",
    } = req.query;

    const query = {};
    if (status !== "All") {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { "userId.email": { $regex: search, $options: "i" } },
      ];
    }

    if (timeRange !== "all") {
      const now = new Date();
      let startDate;
      switch (timeRange) {
        case "12m":
          startDate = new Date(now.setMonth(now.getMonth() - 12));
          break;
        case "30d":
          startDate = new Date(now.setDate(now.getDate() - 30));
          break;
        case "7d":
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case "24h":
          startDate = new Date(now.setHours(now.getHours() - 24));
          break;
        default:
          startDate = null;
      }
      if (startDate) {
        query.orderDate = { $gte: startDate };
      }
    }

    const sortOrder = order === "asc" ? 1 : -1;
    const sortField =
      sort === "orderNumber" ? "orderNumber" : sort === "total" ? "total" : "createdAt";

    const orders = await Order.find(query)
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          model: "Product",
        },
      })
      .populate("userId")
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const totalOrders = await Order.countDocuments(query);

    const formattedOrders = orders.map((order) => ({
      ...order,
      order_items: Array.isArray(order.order_items) ? order.order_items : [],
    }));

    res.render("ordermanagment", {
      orders: formattedOrders,
      currentPage: Number(page),
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders,
      currentStatus: status,
      searchQuery: search,
      sort,
      sortOrder: order,
      timeRange,
      limit: Number(limit),
    });
  } catch (error) {
    console.error(
      "getorderController: Error fetching orders:",
      error.message,
      error.stack
    );
    res.status(500).render("error", { message: "Internal server error" });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    const validStatuses = [
      "Pending",
      "Processing",
      "Confirmed",
      "Shipped",
      "Delivered",
      "Cancelled",
      "Return Requested",
      "Return Approved",
      "Returned",
      "Return Rejected",
    ];
    if (!validStatuses.includes(status)) {
      console.error("updateOrderStatus: Invalid status:", status);
      return res
        .status(400)
        .json({ success: false, message: `Invalid status: ${status}` });
    }

    let order;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId);
    } else {
      order = await Order.findOne({ orderNumber: orderId });
    }

    if (!order) {
      console.error(
        "updateOrderStatus: Order not found for ID/orderNumber:",
        orderId
      );
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status === "Cancelled" && status === "Delivered") {
      console.error(
        "updateOrderStatus: Cannot deliver a cancelled order:",
        orderId
      );
      return res
        .status(400)
        .json({ success: false, message: "Cannot deliver a cancelled order" });
    }

    order.status = status;
    if (status === "Delivered" && !order.deliveryDate) {
      order.deliveryDate = new Date();
    }
    await order.save();

    res.json({ success: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error(
      "Error in updateOrderStatus:",
      error.message,
      error.stack
    );
    res
      .status(500)
      .json({ success: false, message: "Server issue: " + error.message });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .render("page-404", { message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId)
      .populate({
        path: "userId",
        select: "fullname email",
      })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          select: "name images",
        },
      })
      .populate("address")
      .lean();

    if (!order) {
      return res
        .status(404)
        .render("page-404", { message: "Order not found" });
    }

    const formattedOrder = {
      _id: order._id.toString(),
      orderId: order.orderNumber || order._id,
      products: order.order_items.map((item) => {
        if (!item.productId) {
          console.error("Product not found for order item:", item);
          return {
            name: item.product_name || "Unknown Product",
            image: "/api/placeholder/50/50",
            quantity: item.quantity || 1,
            price: (item.price || 0).toFixed(2),
            total: (item.total_amount || 0).toFixed(2),
          };
        }
        return {
          name: item.product_name || item.productId.name || "Unknown Product",
          image: item.productId.images?.[0]?.url || "/api/placeholder/50/50",
          quantity: item.quantity || 1,
          price: (item.price || 0).toFixed(2),
          total: (item.total_amount || 0).toFixed(2),
        };
      }),
      date: order.orderDate || order.createdAt,
      formattedDate: new Date(
        order.orderDate || order.createdAt
      ).toLocaleString("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      customer: {
        fullname: order.userId?.fullname || "Unknown",
        email: order.userId?.email || "N/A",
      },
      total: (order.total || 0).toFixed(2),
      payment: order.paymentMethod || "N/A",
      status: order.status || "Pending",
      address: order.address || {},
    };

    res.render("adminorderDetails", { order: formattedOrder });
  } catch (error) {
    console.error("Error in getOrderDetails:", error);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

const manageReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { action, rejectionReason } = req.body;
    console.log(
      `manageReturn: Processing return for order ID: ${orderId}, Action: ${action}`
    );

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("manageReturn: Invalid order ID:", orderId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    if (!["approve", "reject"].includes(action)) {
      console.error("manageReturn: Invalid action:", action);
      return res
        .status(400)
        .json({ success: false, message: "Invalid action" });
    }

    if (action === "reject" && (!rejectionReason || rejectionReason.trim() === "")) {
      console.error("manageReturn: Rejection reason is required");
      return res
        .status(400)
        .json({ success: false, message: "Rejection reason is required" });
    }

    const order = await Order.findById(orderId).populate({
      path: "order_items",
      populate: {
        path: "productId",
        model: "Product",
      },
    });
    if (!order) {
      console.error(`manageReturn: Order not found for ID: ${orderId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    console.log(
      `manageReturn: Current order state - Status: ${order.status}, Refunded: ${order.refunded}, Order Items: ${JSON.stringify(order.order_items)}`
    );

    if (order.refunded) {
      console.error(
        `manageReturn: Refund already processed for order ID: ${orderId}`
      );
      return res.status(400).json({
        success: false,
        message: "Refund already processed for this order",
      });
    }

    if (action === "approve") {
      if (order.status !== "Return Requested") {
        console.error(
          `manageReturn: Cannot approve return, current status: ${order.status}`
        );
        return res.status(400).json({
          success: false,
          message: `Cannot approve return for order in ${order.status} status`,
        });
      }

      // Validate order_items
      if (!order.order_items || order.order_items.length === 0) {
        console.error(`manageReturn: No valid order items found for order ID: ${orderId}`);
        return res.status(400).json({
          success: false,
          message: "No valid order items found for refund",
        });
      }

      for (const item of order.order_items) {
        if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
          console.error(`manageReturn: Invalid product ID in order item: ${JSON.stringify(item)}`);
          return res.status(400).json({
            success: false,
            message: `Invalid product ID in order item: ${item._id}`,
          });
        }
        if (!item.quantity || item.quantity <= 0) {
          console.error(`manageReturn: Invalid quantity in order item: ${JSON.stringify(item)}`);
          return res.status(400).json({
            success: false,
            message: `Invalid quantity in order item: ${item._id}`,
          });
        }
        if (!item.size) {
          console.error(`manageReturn: Missing size in order item: ${JSON.stringify(item)}`);
          return res.status(400).json({
            success: false,
            message: `Missing size in order item: ${item._id}`,
          });
        }
      }

      // Update order status to Return Approved
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: "Return Approved" },
        { new: true }
      );

      if (!updatedOrder) {
        console.error(
          `manageReturn: Failed to update order status to Return Approved for ID: ${orderId}`
        );
        return res.status(500).json({
          success: false,
          message: "Failed to update order status to Return Approved",
        });
      }

      console.log(
        `manageReturn: Order status updated to Return Approved for ID: ${orderId}`
      );

      try {
        // Process refund
        await processRefund(updatedOrder);

        // Mark order as refunded and Returned
        updatedOrder.refunded = true;
        updatedOrder.status = "Returned";
        await updatedOrder.save();

        console.log(
          `manageReturn: Return approved and refund processed for ID: ${orderId}`
        );
        return res.status(200).json({
          success: true,
          message: "Return approved and refund processed successfully",
        });
      } catch (error) {
        console.error(
          "manageReturn: Failed to process refund, rolling back status for order ID:",
          orderId,
          error.message,
          error.stack
        );
        // Rollback order status
        await Order.findByIdAndUpdate(orderId, { status: "Return Requested" });
        throw error;
      }
    } else {
      if (order.status !== "Return Requested") {
        console.error(
          `manageReturn: Cannot reject return, current status: ${order.status}`
        );
        return res.status(400).json({
          success: false,
          message: `Cannot reject return for order in ${order.status} status`,
        });
      }

      // Reject return
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: "Return Rejected", returnRejectionReason: rejectionReason },
        { new: true }
      );

      if (!updatedOrder) {
        console.error(
          `manageReturn: Failed to update order status to Return Rejected for ID: ${orderId}`
        );
        return res.status(500).json({
          success: false,
          message: "Failed to update order status to Return Rejected",
        });
      }

      console.log(
        `manageReturn: Return rejected for ID: ${orderId}, Reason: ${rejectionReason}`
      );
      return res.status(200).json({
        success: true,
        message: "Return rejected successfully",
      });
    }
  } catch (error) {
    console.error(
      "manageReturn: Error processing return for order ID:",
      req.params.id,
      error.message,
      error.stack
    );
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`,
    });
  }
};

const processRefund = async (order) => {
  try {
    console.log(
      `processRefund: Processing refund for order ID: ${order._id}`
    );

    if (!order.order_items || order.order_items.length === 0) {
      throw new Error("No order items found for refund");
    }

    // Restore product stock
    for (const item of order.order_items) {
      console.log(
        `processRefund: Processing order item: ${JSON.stringify(item)}`
      );
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
        console.warn(`processRefund: Skipping invalid product ID: ${item.productId}`);
        continue; // Skip invalid items
      }
      if (!item.quantity || item.quantity <= 0) {
        console.warn(`processRefund: Skipping invalid quantity: ${item.quantity}`);
        continue;
      }
      if (!item.size) {
        console.warn(`processRefund: Skipping missing size in order item: ${item._id}`);
        continue;
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        console.warn(`processRefund: Product not found for ID: ${item.productId}, skipping`);
        continue;
      }

      const variantIndex = product.variants.findIndex(
        (v) => v.size === item.size
      );
      if (variantIndex === -1) {
        console.warn(
          `processRefund: Variant with size ${item.size} not found for product ID: ${item.productId}, skipping`
        );
        continue;
      }

      console.log(
        `processRefund: Restoring stock for product ID: ${item.productId}, Quantity: ${item.quantity}, Size: ${item.size}`
      );
      product.variants[variantIndex].variantQuantity += item.quantity;
      await product.save();
    }

    // Credit user's wallet
    const refundAmount = order.total;
    if (refundAmount <= 0) {
      throw new Error(
        "Invalid refund amount: Amount must be greater than zero"
      );
    }

    let wallet = await Wallet.findOne({ userId: order.userId });
    if (!wallet) {
      wallet = new Wallet({
        userId: order.userId,
        amount: 0,
        transactions: [],
      });
    }

    wallet.amount += refundAmount;
    wallet.transactions.push({
      type: "credit",
      amount: refundAmount,
      transactionRef: `TXN-REFUND-${uuidv4()}`,
      description: `Refund for order ${order.orderNumber || order._id}`,
      date: new Date(),
    });

    await wallet.save();
    console.log(
      `processRefund: Wallet credited with ${refundAmount} for user ID: ${order.userId}`
    );

    // Create audit log
    const AuditLog = mongoose.model(
      "AuditLog",
      new mongoose.Schema({
        action: String,
        orderId: mongoose.Schema.Types.ObjectId,
        userId: mongoose.Schema.Types.ObjectId,
        amount: Number,
        timestamp: { type: Date, default: Date.now },
      })
    );
    await new AuditLog({
      action: "REFUND_PROCESSED",
      orderId: order._id,
      userId: order.userId,
      amount: refundAmount,
    }).save();
    console.log(
      `processRefund: Audit log created for refund of order ID: ${order._id}`
    );
  } catch (error) {
    console.error(
      "processRefund: Error processing refund for order ID:",
      order._id,
      error.message,
      error.stack
    );
    throw error;
  }
};

module.exports = {
  getorderController,
  updateOrderStatus,
  getOrderDetails,
  manageReturn,
};