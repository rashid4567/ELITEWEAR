const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const Cart = require("../../model/cartScheema");
const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Coupon = require("../../model/couponScheema");
const Wallet = require("../../model/walletScheema");
const Address = require("../../model/AddressScheema");
const {
  generateOrderNumber,
  generateTransactionId,
} = require("../../utils/helpers");
const { processRefundToWallet } = require("./walletController");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const updateOrderStatusHelper = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return;
    }

    const orderItems = await OrderItem.find({ orderId: order._id });

    if (orderItems.length === 0) {
      return;
    }

    const statusCounts = {};
    for (const item of orderItems) {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    }

    const totalItems = orderItems.length;

    let newStatus = order.status;

    const allSameStatus = Object.keys(statusCounts).length === 1;
    if (allSameStatus) {
      newStatus = Object.keys(statusCounts)[0];
    } else if (
      statusCounts["Cancelled"] &&
      statusCounts["Cancelled"] < totalItems
    ) {
      newStatus = "Partially Cancelled";
    } else if (
      (statusCounts["Returned"] ||
        statusCounts["Return Requested"] ||
        statusCounts["Return Approved"]) &&
      (statusCounts["Returned"] || 0) +
        (statusCounts["Return Requested"] || 0) +
        (statusCounts["Return Approved"] || 0) <
        totalItems
    ) {
      newStatus = "Partially Returned";
    } else if (Object.keys(statusCounts).length > 1) {
      if (statusCounts["Delivered"]) {
        newStatus = "Partially Delivered";
      } else if (statusCounts["Shipped"]) {
        newStatus = "Partially Shipped";
      }
    }

    if (newStatus !== order.status) {
      order.status = newStatus;

      if (!order.statusHistory) {
        order.statusHistory = [];
      }

      order.statusHistory.push({
        status: newStatus,
        date: new Date(),
        note: `Status updated to ${newStatus} based on item statuses`,
      });
      await order.save();
    } else {
    }

    return newStatus;
  } catch (error) {
    console.error("[ERROR] Error updating order status:", error);
    throw error;
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const { paymentMethod, couponCode } = req.body;

    if (!["COD", "Wallet"].includes(paymentMethod)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment method" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "name images variants",
    });

    if (!cart || cart.items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Your cart is empty" });
    }

    for (const item of cart.items) {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      if (!variant) {
        return res.status(400).json({
          success: false,
          message: `Invalid variant for product ${item.productId.name}`,
        });
      }
      if (variant.varientquatity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${variant.varientquatity} units of ${item.productId.name} (${item.size}) are available`,
        });
      }
    }

    let totalPrice = 0;
    for (const item of cart.items) {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      totalPrice += variant.salePrice * item.quantity;
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    let grandTotal = totalPrice + deliveryCharge;

    let discount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({ coupencode: couponCode });
      if (!coupon) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid coupon code" });
      }

      const now = new Date();
      if (
        now < new Date(coupon.startingDate) ||
        now > new Date(coupon.expiryDate)
      ) {
        return res.status(400).json({
          success: false,
          message: "Coupon is not valid at this time",
        });
      }

      if (totalPrice < coupon.minimumPurchase) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${coupon.minimumPurchase} required for this coupon`,
        });
      }

      const userUsage = coupon.usedBy.find(
        (usage) => usage.userId.toString() === userId.toString()
      );
      if (userUsage && userUsage.usageCount >= coupon.limit) {
        return res.status(400).json({
          success: false,
          message: "You have already used this coupon",
        });
      }

      discount = (totalPrice * coupon.couponpercent) / 100;
      if (discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }

      grandTotal -= discount;
      appliedCoupon = coupon;
    }

    const addressId = req.session.checkout?.addressId;
    if (!addressId) {
      return res
        .status(400)
        .json({ success: false, message: "Delivery address not selected" });
    }

    if (paymentMethod === "Wallet") {
      if (user.walletBalance === undefined) {
        user.walletBalance = 0;
        await user.save();
      }

      if (user.walletBalance < grandTotal) {
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }
    }

    const orderNumber = generateOrderNumber();
    const newOrder = new Order({
      userId: userId,
      orderNumber,
      paymentMethod,
      address: addressId,
      total: grandTotal,
      discount: discount,
      paymentStatus: paymentMethod === "COD" ? "Pending" : "Paid",
      orderDate: new Date(),
      status: "Processing",
      statusHistory: [
        {
          status: "Processing",
          date: new Date(),
          note: "Order placed successfully",
        },
      ],
    });

    await newOrder.save();

    const orderItems = [];
    for (const item of cart.items) {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      const orderItem = new OrderItem({
        productId: item.productId._id,
        orderId: newOrder._id,
        product_name: item.productId.name,
        quantity: item.quantity,
        size: item.size,
        price: variant.salePrice,
        total_amount: variant.salePrice * item.quantity,
        itemImage:
          item.productId.images && item.productId.images.length > 0
            ? item.productId.images[0].url
            : null,
        status: "Processing",
        statusHistory: [
          {
            status: "Processing",
            date: new Date(),
            note: "Order item created",
          },
        ],
      });
      await orderItem.save();
      orderItems.push(orderItem._id);
    }

    newOrder.order_items = orderItems;
    await newOrder.save();

    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id);
      if (product) {
        const variantIndex = product.variants.findIndex(
          (v) => v.size === item.size
        );
        if (variantIndex !== -1) {
          product.variants[variantIndex].varientquatity -= item.quantity;
          await product.save();
        }
      }
    }

    if (appliedCoupon) {
      const userIndex = appliedCoupon.usedBy.findIndex(
        (usage) => usage.userId.toString() === userId.toString()
      );
      if (userIndex !== -1) {
        appliedCoupon.usedBy[userIndex].usageCount += 1;
      } else {
        appliedCoupon.usedBy.push({ userId, usageCount: 1 });
      }
      await appliedCoupon.save();
    }

    if (paymentMethod === "Wallet") {
      user.walletBalance -= grandTotal;
      await user.save();

      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({
          userId,
          amount: 0,
          transactions: [],
        });
      }

      wallet.transactions.push({
        amount: grandTotal,
        type: "debit",
        description: `Payment for order #${orderNumber}`,
        transactionRef: generateTransactionId(),
        date: new Date(),
      });
      await wallet.save();
    }

    await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

    delete req.session.checkout;

    req.session.lastOrderId = newOrder._id;

    return res.status(200).json({
      success: true,
      message: "Order placed successfully",
      redirect: "/order-success",
    });
  } catch (error) {
    console.error("Error placing order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to place order. Please try again.",
    });
  }
};

const loadOrderSuccess = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.session.lastOrderId;

    if (!orderId) {
      return res.redirect("/orders");
    }

    const order = await Order.findById(orderId)
      .populate("userId")
      .populate("address")
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          select: "name",
        },
      });

    if (!order) {
      return res.redirect("/orders");
    }

    const user = await User.findById(userId);

    res.render("order-success", {
      title: "Order Success",
      user,
      order,
      page: "order-success",
    });

    delete req.session.lastOrderId;
  } catch (error) {
    console.error("Error loading order success page:", error);
    res.redirect("/orders");
  }
};

const getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login");
    }

    const totalOrders = await Order.countDocuments({ userId });
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find({ userId })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
        },
      })
      .populate("address")
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);

    console.log(`Found ${orders.length} orders for user ${userId}`);

    orders.forEach((order) => {
      console.log(
        `Order ${order._id}: Payment Method: ${order.paymentMethod}, Payment Status: ${order.paymentStatus}, Status: ${order.status}`
      );
    });

    const ordersWithProgress = orders.map((order) => {
      if (
        order.paymentMethod === "Online" &&
        (order.paymentStatus === "Failed" || order.paymentStatus === "Pending")
      ) {
        console.log(`Order ${order._id} has failed/pending payment status`);
        return { ...order.toObject(), progressWidth: 0 };
      }

      let progressWidth = 0;
      switch (order.status) {
        case "Pending":
          progressWidth = 20;
          break;
        case "Processing":
          progressWidth = 40;
          break;
        case "Shipped":
          progressWidth = 60;
          break;
        case "Out for Delivery":
          progressWidth = 80;
          break;
        case "Delivered":
        case "Returned":
          progressWidth = 100;
          break;
        case "Cancelled":
        case "Return Rejected":
          progressWidth = 100;
          break;
        case "Return Requested":
          progressWidth = 70;
          break;
        case "Return Approved":
          progressWidth = 85;
          break;
        case "Partially Cancelled":
        case "Partially Returned":
        case "Partially Delivered":
        case "Partially Shipped":
          progressWidth = 75;
          break;
        default:
          progressWidth = 0;
      }
      return { ...order.toObject(), progressWidth };
    });

    res.render("orders", {
      title: "My Orders",
      user,
      orders: ordersWithProgress,
      hasOrders: totalOrders > 0,
      currentPage: page,
      totalPages,
      page: "orders",
    });
  } catch (error) {
    console.error("Error getting user orders:", error);
    res.redirect("/");
  }
};
const getOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({
      _id: orderId,
      userId,
    })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
        },
      })
      .populate("address");

    if (!order) {
      return res.redirect("/orders");
    }

    const orderItems = await OrderItem.find({ orderId: order._id }).populate(
      "productId"
    );

    res.render("orderDetails", {
      title: "Order Details",
      user,
      order,
      orderItems,
      page: "order-details",
    });
  } catch (error) {
    console.error("Error getting order details:", error);
    res.redirect("/orders");
  }
};

const trackOrder = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({
      _id: orderId,
      userId,
    })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
        },
      })
      .populate("address");

    if (!order) {
      return res.redirect("/orders");
    }

    let trackingSteps = [];
    let progressWidth = 0;

    if (order.status === "Cancelled") {
      trackingSteps = [
        {
          status: "Order Placed",
          date: order.orderDate.toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
        },
        {
          status: "Cancelled",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-times-circle",
          active: true,
        },
      ];
      progressWidth = 100;
    } else if (
      order.status === "Return Requested" ||
      order.status === "Return Approved" ||
      order.status === "Returned" ||
      order.status === "Return Rejected"
    ) {
      trackingSteps = [
        {
          status: "Order Placed",
          date: order.orderDate.toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
        },
        {
          status: "Processing",
          date: new Date(
            order.orderDate.getTime() + 86400000
          ).toLocaleDateString(),
          icon: "fa-cog",
          active: true,
        },
        {
          status: "Shipped",
          date: new Date(
            order.orderDate.getTime() + 172800000
          ).toLocaleDateString(),
          icon: "fa-truck",
          active: true,
        },
        {
          status: "Delivered",
          date: new Date(
            order.orderDate.getTime() + 432000000
          ).toLocaleDateString(),
          icon: "fa-check-circle",
          active: true,
        },
      ];

      if (order.status === "Return Requested") {
        trackingSteps.push({
          status: "Return Requested",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-undo-alt",
          active: true,
        });
        progressWidth = 70;
      } else if (order.status === "Return Approved") {
        trackingSteps.push({
          status: "Return Requested",
          date: new Date(
            order.updatedAt.getTime() - 86400000
          ).toLocaleDateString(),
          icon: "fa-undo-alt",
          active: true,
        });
        trackingSteps.push({
          status: "Return Approved",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-check",
          active: true,
        });
        progressWidth = 85;
      } else if (order.status === "Returned") {
        trackingSteps.push({
          status: "Return Requested",
          date: new Date(
            order.updatedAt.getTime() - 172800000
          ).toLocaleDateString(),
          icon: "fa-undo-alt",
          active: true,
        });
        trackingSteps.push({
          status: "Return Approved",
          date: new Date(
            order.updatedAt.getTime() - 86400000
          ).toLocaleDateString(),
          icon: "fa-check",
          active: true,
        });
        trackingSteps.push({
          status: "Returned",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-box",
          active: true,
        });
        progressWidth = 100;
      } else if (order.status === "Return Rejected") {
        trackingSteps.push({
          status: "Return Requested",
          date: new Date(
            order.updatedAt.getTime() - 86400000
          ).toLocaleDateString(),
          icon: "fa-undo-alt",
          active: true,
        });
        trackingSteps.push({
          status: "Return Rejected",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-times-circle",
          active: true,
        });
        progressWidth = 100;
      }
    } else if (
      order.status === "Partially Cancelled" ||
      order.status === "Partially Returned" ||
      order.status === "Partially Delivered" ||
      order.status === "Partially Shipped"
    ) {
      trackingSteps = [
        {
          status: "Order Placed",
          date: order.orderDate.toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
        },
        {
          status: "Processing",
          date: new Date(
            order.orderDate.getTime() + 86400000
          ).toLocaleDateString(),
          icon: "fa-cog",
          active: true,
        },
        {
          status: order.status,
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-random",
          active: true,
          note: "Some items have different statuses. Check order details for more information.",
        },
      ];
      progressWidth = 75;
    } else {
      trackingSteps = [
        {
          status: "Order Placed",
          date: order.orderDate.toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
        },
        {
          status: "Processing",
          date:
            order.status === "Pending"
              ? "Pending"
              : new Date(
                  order.orderDate.getTime() + 86400000
                ).toLocaleDateString(),
          icon: "fa-cog",
          active: order.status !== "Pending",
        },
        {
          status: "Shipped",
          date:
            order.status === "Pending" || order.status === "Processing"
              ? "Pending"
              : new Date(
                  order.orderDate.getTime() + 172800000
                ).toLocaleDateString(),
          icon: "fa-truck",
          active: order.status !== "Pending" && order.status !== "Processing",
        },
        {
          status: "Out for Delivery",
          date:
            order.status === "Pending" ||
            order.status === "Processing" ||
            order.status === "Shipped"
              ? "Pending"
              : new Date(
                  order.orderDate.getTime() + 345600000
                ).toLocaleDateString(),
          icon: "fa-truck-loading",
          active:
            order.status === "Out for Delivery" || order.status === "Delivered",
        },
        {
          status: "Delivered",
          date:
            order.status === "Delivered"
              ? new Date(
                  order.orderDate.getTime() + 432000000
                ).toLocaleDateString()
              : "Pending",
          icon: "fa-check-circle",
          active: order.status === "Delivered",
        },
      ];

      switch (order.status) {
        case "Pending":
          progressWidth = 20;
          break;
        case "Processing":
          progressWidth = 40;
          break;
        case "Shipped":
          progressWidth = 60;
          break;
        case "Out for Delivery":
          progressWidth = 80;
          break;
        case "Delivered":
          progressWidth = 100;
          break;
        default:
          progressWidth = 0;
      }
    }

    res.render("orderTracking", {
      title: "Track Order",
      user,
      order,
      trackingSteps,
      progressWidth,
      page: "order-tracking",
    });
  } catch (error) {
    console.error("Error tracking order:", error);
    res.redirect("/orders");
  }
};

const cancelOrderItem = async (req, res) => {
  try {
    const itemId = req.params.itemId || req.params.orderItemId;
    const userId = req.session.user || req.user._id;
    const { cancelReason } = req.body;

    console.log(
      `[INFO] Processing cancellation for item ${itemId} by user ${userId}`
    );

    if (!cancelReason) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    const orderItem = await OrderItem.findById(itemId);
    if (!orderItem) {
      console.log(`[ERROR] Order item not found: ${itemId}`);
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      });
    }

    const order = await Order.findById(orderItem.orderId);
    if (!order) {
      console.log(`[ERROR] Parent order not found for item: ${itemId}`);
      return res.status(404).json({
        success: false,
        message: "Parent order not found",
      });
    }

    if (order.userId.toString() !== userId.toString()) {
      console.log(
        `[ERROR] Unauthorized cancellation attempt for item ${itemId} by user ${userId}`
      );
      return res.status(403).json({
        success: false,
        message: "You are not authorized to cancel this item",
      });
    }

    const cancellableStates = ["Processing", "Pending"];
    if (!cancellableStates.includes(orderItem.status)) {
      console.log(
        `[ERROR] Item ${itemId} cannot be cancelled in state: ${orderItem.status}`
      );
      return res.status(400).json({
        success: false,
        message: `This item cannot be cancelled in its current status (${orderItem.status})`,
      });
    }

    if (
      ![
        "Processing",
        "Pending",
        "Partially Shipped",
        "Partially Delivered",
      ].includes(order.status)
    ) {
      console.log(
        `[ERROR] Order ${order._id} cannot have items cancelled in state: ${order.status}`
      );
      return res.status(400).json({
        success: false,
        message: `Cannot cancel items from an order in ${order.status} status`,
      });
    }

    orderItem.status = "Cancelled";
    orderItem.cancelReason = cancelReason;
    orderItem.cancelledAt = new Date();

    if (!orderItem.statusHistory) {
      orderItem.statusHistory = [];
    }

    orderItem.statusHistory.push({
      status: "Cancelled",
      date: new Date(),
      note: `Cancelled by user. Reason: ${cancelReason}`,
    });

    await orderItem.save();
    console.log(`[INFO] Item ${itemId} status updated to Cancelled`);

    try {
      const product = await Product.findById(orderItem.productId);
      if (product) {
        const variantIndex = product.variants.findIndex(
          (v) => v.size === orderItem.size
        );
        if (variantIndex !== -1) {
          product.variants[variantIndex].varientquatity += orderItem.quantity;
          await product.save();
          console.log(
            `[INFO] Restored ${orderItem.quantity} units to inventory for product ${orderItem.productId}`
          );
        } else {
          console.log(
            `[WARN] Product variant not found for size: ${orderItem.size}`
          );
        }
      } else {
        console.log(`[WARN] Product not found: ${orderItem.productId}`);
      }
    } catch (inventoryError) {
      console.error(
        `[ERROR] Failed to restore inventory: ${inventoryError.message}`
      );
    }

    let refundAmount = 0;
    let refundProcessed = false;

    if (
      order.paymentStatus === "Paid" ||
      order.paymentMethod === "Wallet" ||
      (order.paymentMethod === "Online" && order.paymentStatus === "Completed")
    ) {
      refundAmount = orderItem.total_amount;

      try {
        await processRefundToWallet(
          userId,
          refundAmount,
          order.orderNumber,
          `Refund for cancelled item: ${orderItem.product_name}`
        );

        orderItem.refunded = true;
        orderItem.refundAmount = refundAmount;
        orderItem.refundDate = new Date();
        await orderItem.save();

        refundProcessed = true;
        console.log(
          `[INFO] Refund of ₹${refundAmount} processed for item ${itemId}`
        );
      } catch (refundError) {
        console.error(
          `[ERROR] Failed to process refund: ${refundError.message}`
        );
      }
    }

    const newOrderStatus = await updateOrderStatusHelper(order._id);
    console.log(
      `[INFO] Order ${order._id} status updated to ${newOrderStatus}`
    );

    return res.status(200).json({
      success: true,
      message: "Item cancelled successfully",
      item: {
        id: orderItem._id,
        name: orderItem.product_name,
        status: orderItem.status,
        cancelReason: orderItem.cancelReason,
        cancelledAt: orderItem.cancelledAt,
      },
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: newOrderStatus,
      },
      refund: refundProcessed
        ? {
            amount: refundAmount,
            method: "Wallet",
            processed: true,
          }
        : null,
    });
  } catch (error) {
    console.error(
      `[ERROR] Error cancelling order item: ${error.message}`,
      error
    );
    return res.status(500).json({
      success: false,
      message: "Failed to cancel item. Please try again.",
      error: error.message,
    });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    const itemId = req.params.itemId || req.params.orderItemId;
    const userId = req.session.user || req.user._id;
    const { returnReason } = req.body;

    console.log(
      `[INFO] Processing return request for item ${itemId} by user ${userId}`
    );

    if (!returnReason) {
      return res.status(400).json({
        success: false,
        message: "Return reason is required",
      });
    }

    const orderItem = await OrderItem.findById(itemId);
    if (!orderItem) {
      console.log(`[ERROR] Order item not found: ${itemId}`);
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      });
    }

    const order = await Order.findById(orderItem.orderId);
    if (!order) {
      console.log(`[ERROR] Parent order not found for item: ${itemId}`);
      return res.status(404).json({
        success: false,
        message: "Parent order not found",
      });
    }

    if (order.userId.toString() !== userId.toString()) {
      console.log(
        `[ERROR] Unauthorized return attempt for item ${itemId} by user ${userId}`
      );
      return res.status(403).json({
        success: false,
        message: "You are not authorized to return this item",
      });
    }

    if (orderItem.status !== "Delivered") {
      console.log(
        `[ERROR] Item ${itemId} cannot be returned in state: ${orderItem.status}`
      );
      return res.status(400).json({
        success: false,
        message: `Only delivered items can be returned. Current status: ${orderItem.status}`,
      });
    }

    const deliveryDate =
      order.deliveryDate ||
      order.statusHistory?.find((h) => h.status === "Delivered")?.date ||
      order.updatedAt ||
      order.orderDate;

    const returnPeriodDays = 7;
    const returnDeadline = new Date(deliveryDate);
    returnDeadline.setDate(returnDeadline.getDate() + returnPeriodDays);

    if (new Date() > returnDeadline) {
      console.log(
        `[ERROR] Return period expired for item ${itemId}. Delivery date: ${deliveryDate}, Deadline: ${returnDeadline}`
      );
      return res.status(400).json({
        success: false,
        message: `Return period of ${returnPeriodDays} days has expired. Last date for return was ${returnDeadline.toLocaleDateString()}`,
      });
    }

    orderItem.status = "Return Requested";
    orderItem.returnReason = returnReason;
    orderItem.returnRequestedDate = new Date();

    if (!orderItem.statusHistory) {
      orderItem.statusHistory = [];
    }

    orderItem.statusHistory.push({
      status: "Return Requested",
      date: new Date(),
      note: `Return requested by user. Reason: ${returnReason}`,
    });

    await orderItem.save();
    console.log(`[INFO] Item ${itemId} status updated to Return Requested`);

    const newOrderStatus = await updateOrderStatusHelper(order._id);
    console.log(
      `[INFO] Order ${order._id} status updated to ${newOrderStatus}`
    );

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
      item: {
        id: orderItem._id,
        name: orderItem.product_name,
        status: orderItem.status,
        returnReason: orderItem.returnReason,
        returnRequestedDate: orderItem.returnRequestedDate,
      },
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: newOrderStatus,
      },
      nextSteps:
        "Your return request has been submitted and is pending approval. You will be notified once it's approved.",
    });
  } catch (error) {
    console.error(
      `[ERROR] Error processing return request: ${error.message}`,
      error
    );
    return res.status(500).json({
      success: false,
      message: "Failed to submit return request. Please try again.",
      error: error.message,
    });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.id;
    const { cancelReason } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      userId,
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (!["Pending", "Processing"].includes(order.status)) {
      return res
        .status(400)
        .json({ success: false, message: "This order cannot be cancelled" });
    }

    const orderItems = await OrderItem.find({ orderId: order._id });

    for (const item of orderItems) {
      item.status = "Cancelled";
      item.cancelReason = cancelReason || "Cancelled by user";
      item.cancelledAt = new Date();

      if (!item.statusHistory) {
        item.statusHistory = [];
      }

      item.statusHistory.push({
        status: "Cancelled",
        date: new Date(),
        note: `Cancelled as part of full order cancellation. Reason: ${
          cancelReason || "Cancelled by user"
        }`,
      });
      await item.save();
    }

    order.status = "Cancelled";
    order.cancelReason = cancelReason || "Cancelled by user";

    if (!order.statusHistory) {
      order.statusHistory = [];
    }

    order.statusHistory.push({
      status: "Cancelled",
      date: new Date(),
      note: `Order cancelled by user. Reason: ${
        cancelReason || "Cancelled by user"
      }`,
    });
    await order.save();

    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (product) {
        const variantIndex = product.variants.findIndex(
          (v) => v.size === item.size
        );
        if (variantIndex !== -1) {
          product.variants[variantIndex].varientquatity += item.quantity;
          await product.save();
        } else {
          console.log(
            `[DEBUG] Product variant not found for size: ${item.size}`
          );
        }
      } else {
        console.log(`[DEBUG] Product not found: ${item.productId}`);
      }
    }

    if (order.paymentMethod === "COD" && order.paymentStatus === "Paid") {
      await processRefundToWallet(
        userId,
        order.total,
        order.orderNumber,
        "Refund for cancelled order"
      );
      order.paymentStatus = "Refunded";
      order.refunded = true;
      await order.save();
    } else if (order.paymentMethod === "Wallet") {
      await processRefundToWallet(
        userId,
        order.total,
        order.orderNumber,
        "Refund for cancelled order"
      );
      order.paymentStatus = "Refunded";
      order.refunded = true;
      await order.save();
    } else if (order.paymentMethod === "Online") {
      await processRefundToWallet(
        userId,
        order.total,
        order.orderNumber,
        "Refund for cancelled order"
      );
      order.paymentStatus = "Refunded";
      order.refunded = true;
      await order.save();
    }

    return res
      .status(200)
      .json({ success: true, message: "Order cancelled successfully" });
  } catch (error) {
    console.error("[ERROR] Error cancelling order:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to cancel order" });
  }
};

const initiateReturn = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.id;
    const { returnReason } = req.body;

    if (!returnReason) {
      return res
        .status(400)
        .json({ success: false, message: "Return reason is required" });
    }

    const order = await Order.findOne({
      _id: orderId,
      userId,
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    const deliveryDate =
      order.deliveryDate || order.updatedAt || order.orderDate;
    const returnPeriod = 14 * 24 * 60 * 60 * 1000;
    if (Date.now() - deliveryDate.getTime() > returnPeriod) {
      return res.status(400).json({
        success: false,
        message: "Return period has expired (14 days)",
      });
    }

    const orderItems = await OrderItem.find({ orderId: order._id });

    for (const item of orderItems) {
      if (item.status === "Delivered") {
        item.status = "Return Requested";
        item.returnReason = returnReason;
        item.returnRequestedDate = new Date();

        if (!item.statusHistory) {
          item.statusHistory = [];
        }

        item.statusHistory.push({
          status: "Return Requested",
          date: new Date(),
          note: `Return requested as part of full order return. Reason: ${returnReason}`,
        });
        await item.save();
      }
    }

    order.status = "Return Requested";
    order.returnReason = returnReason;
    order.returnRequestedDate = new Date();

    if (!order.statusHistory) {
      order.statusHistory = [];
    }

    order.statusHistory.push({
      status: "Return Requested",
      date: new Date(),
      note: `Return requested by user. Reason: ${returnReason}`,
    });
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("[ERROR] Error initiating return:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit return request" });
  }
};

const reOrder = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.id;

    const order = await Order.findOne({
      _id: orderId,
      userId,
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    cart.items = [];
    await cart.save();

    const orderItems = await OrderItem.find({ orderId: order._id });

    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (!product) {
        continue;
      }

      const variant = product.variants.find((v) => v.size === item.size);
      if (!variant || variant.varientquatity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.name} (${item.size}) is out of stock or has insufficient quantity`,
        });
      }

      cart.items.push({
        productId: product._id,
        quantity: item.quantity,
        size: item.size,
      });
    }

    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Items added to cart",
      redirect: "/checkOut",
    });
  } catch (error) {
    console.error("Error reordering:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reorder" });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.id;

    const order = await Order.findOne({
      _id: orderId,
      userId,
    }).populate("userId");

    if (!order) {
      return res.redirect("/orders");
    }

    const orderItems = await OrderItem.find({ orderId: order._id }).populate(
      "productId"
    );
    const address = await Address.findById(order.address);

    if (!address) {
      return res.redirect("/orders");
    }

    let subtotal = 0;
    orderItems.forEach((item) => {
      subtotal += item.price * item.quantity;
    });

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    const deliveryCharge = order.total > 8000 ? 0 : 200;

    const discount = order.discount || 0;

    const invoiceHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice #${order.orderNumber} - Elite Wear</title>
      <style>
        /* Reset & Base Styles */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #333;
          background-color: #fff;
          padding: 0;
          margin: 0;
        }
        
        /* Container */
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          position: relative;
          background-color: #fff;
        }
        
        /* Header */
        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 50px;
          border-bottom: 1px solid #eaeaea;
          padding-bottom: 30px;
        }
        
        .brand {
          font-size: 32px;
          font-weight: 700;
          color: #000;
          letter-spacing: 1px;
          margin-bottom: 5px;
        }
        
        .invoice-title {
          font-size: 28px;
          font-weight: 300;
          color: #000;
          text-align: right;
          margin-bottom: 15px;
        }
        
        .invoice-details {
          text-align: right;
        }
        
        .invoice-details div {
          margin-bottom: 5px;
        }
        
        .invoice-details .label {
          font-weight: 600;
          color: #666;
          margin-right: 10px;
        }
        
        .invoice-details .value {
          font-weight: 400;
        }
        
        /* Sections */
        .invoice-section {
          margin-bottom: 30px;
        }
        
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #000;
          margin-bottom: 15px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .address-container {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
        }
        
        .address-box {
          width: 48%;
        }
        
        .address-content {
          padding: 15px;
          border: 1px solid #eaeaea;
          border-radius: 4px;
          background-color: #fafafa;
          min-height: 120px;
        }
        
        /* Table */
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        
        .invoice-table th {
          background-color: #000;
          color: #fff;
          font-weight: 600;
          text-align: left;
          padding: 12px 15px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .invoice-table td {
          padding: 12px 15px;
          border-bottom: 1px solid #eaeaea;
          vertical-align: top;
        }
        
        .invoice-table .item-image {
          width: 60px;
          height: 60px;
          object-fit: cover;
          border-radius: 4px;
          margin-right: 10px;
          border: 1px solid #eaeaea;
        }
        
        .invoice-table .item-details {
          display: flex;
          align-items: center;
        }
        
        .invoice-table .item-name {
          font-weight: 600;
        }
        
        .invoice-table .item-size {
          color: #666;
          font-size: 12px;
          margin-top: 3px;
        }
        
        .invoice-table .text-right {
          text-align: right;
        }
        
        .invoice-table .text-center {
          text-align: center;
        }
        
        /* Summary */
        .invoice-summary {
          width: 350px;
          margin-left: auto;
          margin-bottom: 40px;
        }
        
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #eaeaea;
        }
        
        .summary-row.total {
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          font-weight: 700;
          font-size: 16px;
          margin-top: 10px;
          padding: 15px 0;
        }
        
        .summary-row .discount {
          color: #e74c3c;
        }
        
        /* Footer */
        .invoice-footer {
          margin-top: 50px;
          text-align: center;
          color: #666;
          font-size: 12px;
          border-top: 1px solid #eaeaea;
          padding-top: 20px;
        }
        
        .invoice-footer p {
          margin-bottom: 5px;
        }
        
        .thank-you {
          font-size: 18px;
          font-weight: 600;
          color: #000;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        /* Print Styles */
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .invoice-container {
            padding: 20px;
            max-width: 100%;
          }
          
          .no-print {
            display: none !important;
          }
          
          .page-break {
            page-break-before: always;
          }
        }
        
        /* Responsive */
        @media (max-width: 768px) {
          .invoice-container {
            padding: 20px;
          }
          
          .invoice-header {
            flex-direction: column;
          }
          
          .invoice-title, .invoice-details {
            text-align: left;
            margin-top: 20px;
          }
          
          .address-container {
            flex-direction: column;
          }
          
          .address-box {
            width: 100%;
            margin-bottom: 20px;
          }
          
          .invoice-summary {
            width: 100%;
          }
        }
        
        /* Print Button */
        .print-button {
          position: absolute;
          top: 40px;
          right: 40px;
          padding: 10px 20px;
          background-color: #000;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: 1px;
          transition: all 0.3s ease;
        }
        
        .print-button:hover {
          background-color: #333;
        }
        
        @media print {
          .print-button {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <button class="print-button no-print" onclick="window.print()">Print Invoice</button>
        
        <div class="invoice-header">
          <div>
            <div class="brand">ELITE WEAR</div>
            <div>Luxury Fashion & Accessories</div>
          </div>
          
          <div>
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-details">
              <div><span class="label">Invoice #:</span> <span class="value">${
                order.orderNumber
              }</span></div>
              <div><span class="label">Date:</span> <span class="value">${formatDate(
                order.orderDate
              )}</span></div>
              <div><span class="label">Due Date:</span> <span class="value">${formatDate(
                new Date(order.orderDate.getTime() + 7 * 24 * 60 * 60 * 1000)
              )}</span></div>
              <div><span class="label">Payment Status:</span> <span class="value">${
                order.paymentStatus
              }</span></div>
            </div>
          </div>
        </div>
        
        <div class="address-container">
          <div class="address-box">
            <div class="section-title">Bill To</div>
            <div class="address-content">
              <div><strong>${order.userId.fullname}</strong></div>
              <div>${order.userId.email}</div>
              <div>${order.userId.mobile || ""}</div>
            </div>
          </div>
          
          <div class="address-box">
            <div class="section-title">Ship To</div>
            <div class="address-content">
              <div><strong>${address.fullname}</strong></div>
              <div>${address.address}</div>
              <div>${address.city}, ${address.district}</div>
              <div>${address.state} - ${address.pincode}</div>
              <div>Phone: ${address.mobile}</div>
            </div>
          </div>
        </div>
        
        <div class="invoice-section">
          <div class="section-title">Order Items</div>
          <table class="invoice-table">
            <thead>
              <tr>
                <th>Item</th>
                <th class="text-center">Quantity</th>
                <th class="text-right">Price</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${orderItems
                .map(
                  (item) => `
                <tr>
                  <td>
                    <div class="item-details">
                      ${
                        item.itemImage
                          ? `<img src="${item.itemImage}" class="item-image" alt="${item.product_name}">`
                          : ""
                      }
                      <div>
                        <div class="item-name">${item.product_name}</div>
                        <div class="item-size">Size: ${item.size}</div>
                      </div>
                    </div>
                  </td>
                  <td class="text-center">${item.quantity}</td>
                  <td class="text-right">₹${item.price.toFixed(2)}</td>
                  <td class="text-right">₹${(
                    item.price * item.quantity
                  ).toFixed(2)}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
        
        <div class="invoice-summary">
          <div class="summary-row">
            <div>Subtotal</div>
            <div>₹${subtotal.toFixed(2)}</div>
          </div>
          <div class="summary-row">
            <div>Delivery Charge</div>
            <div>₹${deliveryCharge.toFixed(2)}</div>
          </div>
          ${
            discount > 0
              ? `
          <div class="summary-row">
            <div>Discount</div>
            <div class="discount">-₹${discount.toFixed(2)}</div>
          </div>
          `
              : ""
          }
          <div class="summary-row total">
            <div>Total</div>
            <div>₹${order.total.toFixed(2)}</div>
          </div>
        </div>
        
        <div class="invoice-footer">
          <div class="thank-you">Thank You For Your Business</div>
          <p>If you have any questions about this invoice, please contact</p>
          <p>Email: info@elitewear.com | Phone: +91 123 456 7890</p>
          <p>123 Fashion Avenue, New York, NY 10001</p>
        </div>
      </div>
      
      <script>
        // Auto-print when page loads (optional)
        // window.onload = function() {
        //   window.print();
        // }
      </script>
    </body>
    </html>
    `;

    const filename = `elite-wear-invoice-${order.orderNumber}.html`;
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(invoiceHtml);
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.redirect("/orders");
  }
};
const checkItemUpdateability = async (req, res) => {
  try {
    const { orderItemId } = req.params;
    const userId = req.session.user || req.user._id;

    const orderItem = await OrderItem.findById(orderItemId).populate({
      path: "orderId",
      select: "userId",
    });

    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      });
    }

    if (orderItem.orderId.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access this order item",
      });
    }

    const finalStates = ["Cancelled", "Returned"];
    const canUpdate = !finalStates.includes(orderItem.status);

    return res.status(200).json({
      success: true,
      canUpdate,
      status: orderItem.status,
      isFinalState: finalStates.includes(orderItem.status),
    });
  } catch (error) {
    console.error("Error checking item updateability:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check item updateability: " + error.message,
    });
  }
};

const checkOrderUpdateability = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user || req.user._id;

    let order;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId);
    } else {
      order = await Order.findOne({ orderNumber: orderId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access this order",
      });
    }

    const finalStates = ["Cancelled", "Returned"];
    const canUpdate = !finalStates.includes(order.status);

    return res.status(200).json({
      success: true,
      canUpdate,
      status: order.status,
      isFinalState: finalStates.includes(order.status),
    });
  } catch (error) {
    console.error("Error checking order updateability:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check order updateability: " + error.message,
    });
  }
};
const handlePaymentFailure = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user || req.user._id;
    const { failureReason, paymentId } = req.body;

    console.log(`[INFO] Handling payment failure for order ${orderId}`);

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      console.log(`[ERROR] Order not found: ${orderId} for user ${userId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    order.paymentStatus = "Failed";
    order.paymentFailureReason = failureReason || "Payment processing failed";
    order.failedPaymentId = paymentId;
    order.paymentFailedAt = new Date();

    if (!order.statusHistory) {
      order.statusHistory = [];
    }

    order.statusHistory.push({
      status: "Payment Failed",
      date: new Date(),
      note: `Payment attempt failed: ${failureReason || "Unknown reason"}`,
    });

    await order.save();

    console.log(`[INFO] Order ${orderId} payment status updated to Failed`);

    return res.json({
      success: true,
      message: "Payment status updated to failed",
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
    });
  } catch (error) {
    console.error("[ERROR] Error handling payment failure:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment status",
      error: error.message,
    });
  }
};

const getPaymentRetryOptions = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user || req.user._id;

    console.log(`[INFO] Getting payment retry options for order ${orderId}`);

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      console.log(`[ERROR] Order not found: ${orderId} for user ${userId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (!["Failed", "Pending"].includes(order.paymentStatus)) {
      console.log(
        `[ERROR] Payment cannot be retried for order ${orderId} with status ${order.paymentStatus}`
      );
      return res.status(400).json({
        success: false,
        message: "Payment cannot be retried for this order",
      });
    }

    const maxRetryAttempts = 3;
    if ((order.paymentRetryCount || 0) >= maxRetryAttempts) {
      console.log(
        `[ERROR] Maximum retry attempts reached for order ${orderId}`
      );
      return res.status(400).json({
        success: false,
        message: `Maximum payment retry attempts (${maxRetryAttempts}) reached. Please contact customer support.`,
      });
    }

    const paymentMethods = [
      {
        id: "razorpay",
        name: "Credit/Debit Card",
        icon: "credit-card",
        description: "Pay securely with your credit or debit card",
      },
      {
        id: "razorpay_upi",
        name: "UPI",
        icon: "mobile",
        description: "Pay using UPI apps like Google Pay, PhonePe, etc.",
      },
      {
        id: "razorpay_netbanking",
        name: "Net Banking",
        icon: "bank",
        description: "Pay using your bank account",
      },
    ];

    console.log(`[INFO] Returning payment retry options for order ${orderId}`);

    return res.json({
      success: true,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        total: order.total,
        paymentStatus: order.paymentStatus,
        retryCount: order.paymentRetryCount || 0,
      },
      paymentMethods,
      maxRetryAttempts,
    });
  } catch (error) {
    console.error("[ERROR] Error getting payment retry options:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get payment retry options",
      error: error.message,
    });
  }
};

const initPaymentRetry = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user || req.user._id;
    const { paymentMethod } = req.body;

    console.log(
      `[INFO] Initializing payment retry for order ${orderId} with method ${paymentMethod}`
    );

    if (!paymentMethod) {
      return res
        .status(400)
        .json({ success: false, message: "Payment method is required" });
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      console.log(`[ERROR] Order not found: ${orderId} for user ${userId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (!["Failed", "Pending"].includes(order.paymentStatus)) {
      console.log(
        `[ERROR] Payment cannot be retried for order ${orderId} with status ${order.paymentStatus}`
      );
      return res.status(400).json({
        success: false,
        message: "Payment cannot be retried for this order",
      });
    }

    order.paymentRetryCount = (order.paymentRetryCount || 0) + 1;
    order.lastPaymentRetryDate = new Date();
    order.paymentStatus = "Pending";

    if (!order.statusHistory) {
      order.statusHistory = [];
    }

    order.statusHistory.push({
      status: "Payment Retry",
      date: new Date(),
      note: `Payment retry attempt #${order.paymentRetryCount} initiated with ${paymentMethod}`,
    });

    await order.save();

    console.log(
      `[INFO] Payment retry initialized for order ${orderId}, attempt #${order.paymentRetryCount}`
    );

    req.session.paymentRetry = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      amount: order.total,
      paymentMethod,
      timestamp: new Date().getTime(),
    };

    return res.json({
      success: true,
      message: "Payment retry initialized",
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        total: order.total,
        retryCount: order.paymentRetryCount,
      },
      nextStep: "redirect_to_payment",
      redirectUrl: `/checkout-payment?retry=true&orderId=${order._id}`,
    });
  } catch (error) {
    console.error("[ERROR] Error initializing payment retry:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment retry",
      error: error.message,
    });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user || req.user._id;
    const { status, paymentId, transactionDetails } = req.body;

    console.log(
      `[INFO] Updating payment status for order ${orderId} to ${status}`
    );

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "Payment status is required" });
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      console.log(`[ERROR] Order not found: ${orderId} for user ${userId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    order.paymentStatus = status;

    if (status === "Completed") {
      order.paymentId = paymentId;
      order.paymentCompletedAt = new Date();

      if (order.status === "Pending") {
        order.status = "Processing";
      }

      if (transactionDetails) {
        order.transactionDetails = transactionDetails;
      }
    } else if (status === "Failed") {
      order.failedPaymentId = paymentId;
      order.paymentFailedAt = new Date();
      order.paymentFailureReason =
        req.body.failureReason || "Payment processing failed";
    }

    if (!order.statusHistory) {
      order.statusHistory = [];
    }

    order.statusHistory.push({
      status: status === "Completed" ? "Payment Completed" : "Payment Failed",
      date: new Date(),
      note:
        status === "Completed"
          ? `Payment completed successfully with ID: ${paymentId}`
          : `Payment failed: ${req.body.failureReason || "Unknown reason"}`,
    });

    await order.save();

    if (status === "Completed") {
      const orderItems = await OrderItem.find({ orderId: order._id });
      for (const item of orderItems) {
        if (item.status === "Pending") {
          item.status = "Processing";
          await item.save();
        }
      }
    }

    console.log(`[INFO] Order ${orderId} payment status updated to ${status}`);

    if (req.session.paymentRetry) {
      delete req.session.paymentRetry;
    }

    return res.json({
      success: true,
      message: `Payment status updated to ${status}`,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
      redirectUrl:
        status === "Completed"
          ? "/order-success"
          : `/order-details/${order._id}`,
    });
  } catch (error) {
    console.error("[ERROR] Error updating payment status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment status",
      error: error.message,
    });
  }
};

module.exports = {
  placeOrder,
  loadOrderSuccess,
  getUserOrders,
  getOrderDetails,
  trackOrder,
  cancelOrder,
  initiateReturn,
  reOrder,
  checkItemUpdateability,
  checkOrderUpdateability,
  downloadInvoice,
  cancelOrderItem,
  returnOrderItem,
  updateOrderStatus: updateOrderStatusHelper,
  handlePaymentFailure,
  getPaymentRetryOptions,
  initPaymentRetry,
  updatePaymentStatus,
};
