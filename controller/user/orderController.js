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

    const order = await Order.findById(orderId).populate("userId");
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

    const ordersWithProgress = orders.map((order) => {
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

    if (!itemId) {
      return res
        .status(400)
        .json({ success: false, message: "Item ID is required" });
    }

    const userId = req.session.user || req.user._id;
    const { cancelReason } = req.body;

    if (!cancelReason) {
      return res
        .status(400)
        .json({ success: false, message: "Cancellation reason is required" });
    }

    const orderItem = await OrderItem.findById(itemId);
    if (!orderItem) {
      return res
        .status(404)
        .json({ success: false, message: "Order item not found" });
    }

    const order = await Order.findById(orderItem.orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Parent order not found" });
    }

    if (order.userId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access to this order" });
    }

    if (!["Processing", "Pending"].includes(orderItem.status)) {
      return res.status(400).json({
        success: false,
        message: "This item cannot be cancelled in its current status",
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

    const product = await Product.findById(orderItem.productId);
    if (product) {
      const variantIndex = product.variants.findIndex(
        (v) => v.size === orderItem.size
      );
      if (variantIndex !== -1) {
        product.variants[variantIndex].varientquatity += orderItem.quantity;
        await product.save();
      } else {
        console.log(
          `[DEBUG] Product variant not found for size: ${orderItem.size}`
        );
      }
    } else {
      console.log(`[DEBUG] Product not found: ${orderItem.productId}`);
    }

    const refundAmount = orderItem.total_amount;

    if (
      order.paymentStatus === "Paid" ||
      order.paymentMethod === "Wallet" ||
      order.paymentMethod === "Online"
    ) {
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
    }

    const newOrderStatus = await updateOrderStatusHelper(order._id);

    return res.status(200).json({
      success: true,
      message: "Item cancelled successfully",
      refundAmount: refundAmount,
    });
  } catch (error) {
    console.error("[ERROR] Error cancelling order item:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to cancel item" });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    const itemId = req.params.itemId || req.params.orderItemId;

    if (!itemId) {
      return res
        .status(400)
        .json({ success: false, message: "Item ID is required" });
    }

    const userId = req.session.user || req.user._id;
    const { returnReason } = req.body;

    if (!returnReason) {
      return res
        .status(400)
        .json({ success: false, message: "Return reason is required" });
    }

    const orderItem = await OrderItem.findById(itemId);
    if (!orderItem) {
      return res
        .status(404)
        .json({ success: false, message: "Order item not found" });
    }

    const order = await Order.findById(orderItem.orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Parent order not found" });
    }

    if (order.userId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access to this order" });
    }

    if (orderItem.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered items can be returned",
      });
    }

    const deliveryDate =
      order.deliveryDate || order.updatedAt || order.orderDate;
    const returnPeriod = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - deliveryDate.getTime() > returnPeriod) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Return period has expired (14 days)",
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

    const newOrderStatus = await updateOrderStatusHelper(order._id);

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("[ERROR] Error requesting return for order item:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit return request" });
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

    const orderItems = await OrderItem.find({ orderId: order._id });

    // Get address
    const address = await Address.findById(order.address);
    if (!address) {
      return res.redirect("/orders");
    }

    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
      info: {
        Title: `Invoice - ${order.orderNumber}`,
        Author: "ELITE WEAR",
        Subject: "Order Invoice",
      },
    });

    const invoiceFilename = `invoice-${order.orderNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoiceFilename}"`
    );

    doc.pipe(res);

    const primaryColor = "#2c3e50";
    const secondaryColor = "#3498db";
    const accentColor = "#e74c3c";
    const lightGray = "#ecf0f1";
    const mediumGray = "#bdc3c7";
    const darkGray = "#7f8c8d";

    doc
      .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
      .lineWidth(1)
      .stroke(primaryColor);

    doc.rect(50, 50, doc.page.width - 100, 80).fill(primaryColor);

    doc
      .fontSize(28)
      .fillColor("white")
      .font("Helvetica-Bold")
      .text("ELITE WEAR", 0, 75, { align: "center" });

    doc
      .fontSize(14)
      .fillColor("white")
      .font("Helvetica")
      .text("INVOICE", 0, 110, { align: "center" });

    doc
      .rect(350, 150, 200, 100)
      .lineWidth(1)
      .fillColor(lightGray)
      .fill()
      .stroke(primaryColor);

    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("INVOICE DETAILS", 360, 160);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Invoice Number: ${order.orderNumber}`, 360, 180)
      .text(
        `Date: ${new Date(order.orderDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`,
        360,
        195
      )
      .text(`Payment Method: ${order.paymentMethod}`, 360, 210)
      .text(`Payment Status: ${order.paymentStatus}`, 360, 225);

    doc
      .rect(50, 150, 280, 100)
      .lineWidth(1)
      .fillColor(lightGray)
      .fill()
      .stroke(primaryColor);

    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("CUSTOMER DETAILS", 60, 160);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Name: ${order.userId.fullname}`, 60, 180)
      .text(`Email: ${order.userId.email}`, 60, 195);

    doc
      .rect(50, 270, 500, 100)
      .lineWidth(1)
      .fillColor(lightGray)
      .fill()
      .stroke(primaryColor);

    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("SHIPPING ADDRESS", 60, 280);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`${address.fullname}`, 60, 300)
      .text(`${address.address}`, 60, 315)
      .text(`${address.city}, ${address.district}`, 60, 330)
      .text(`${address.state} - ${address.pincode}`, 60, 345)
      .text(`Phone: ${address.mobile}`, 60, 360);

    const tableTop = 390;
    const tableBottom = 650;
    const tableWidth = 500;

    doc.rect(50, tableTop, tableWidth, 25).fillColor(secondaryColor).fill();

    doc
      .fillColor("white")
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("ITEM", 60, tableTop + 8)
      .text("DESCRIPTION", 180, tableTop + 8)
      .text("QTY", 320, tableTop + 8)
      .text("PRICE", 380, tableTop + 8)
      .text("AMOUNT", 450, tableTop + 8);

    let y = tableTop + 25;
    let totalAmount = 0;
    let alternateRow = false;

    for (const item of orderItems) {
      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      if (alternateRow) {
        doc.rect(50, y, tableWidth, 20).fillColor(lightGray).fill();
      }
      alternateRow = !alternateRow;

      doc
        .fillColor(primaryColor)
        .fontSize(9)
        .font("Helvetica")
        .text(item.product_name.substring(0, 20), 60, y + 5, { width: 110 })
        .text(`Size: ${item.size}`, 180, y + 5)
        .text(item.quantity.toString(), 320, y + 5)
        .text(`₹${item.price.toFixed(2)}`, 380, y + 5)
        .text(`₹${itemTotal.toFixed(2)}`, 450, y + 5);

      y += 20;

      if (y > tableBottom - 20) {
        doc.addPage();
        y = 50;

        doc.rect(50, y, tableWidth, 25).fillColor(secondaryColor).fill();

        doc
          .fillColor("white")
          .fontSize(10)
          .font("Helvetica-Bold")
          .text("ITEM", 60, y + 8)
          .text("DESCRIPTION", 180, y + 8)
          .text("QTY", 320, y + 8)
          .text("PRICE", 380, y + 8)
          .text("AMOUNT", 450, y + 8);

        y += 25;
      }
    }

    doc
      .rect(50, tableTop, tableWidth, y - tableTop)
      .lineWidth(1)
      .stroke(primaryColor);

    doc
      .moveTo(170, tableTop)
      .lineTo(170, y)
      .moveTo(310, tableTop)
      .lineTo(310, y)
      .moveTo(370, tableTop)
      .lineTo(370, y)
      .moveTo(440, tableTop)
      .lineTo(440, y)
      .stroke(mediumGray);

    const summaryX = 300;
    const summaryWidth = 250;
    const summaryY = y + 20;

    doc
      .rect(summaryX, summaryY, summaryWidth, 100)
      .lineWidth(1)
      .fillColor(lightGray)
      .fill()
      .stroke(primaryColor);

    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font("Helvetica")
      .text("Subtotal:", summaryX + 20, summaryY + 15)
      .text("Delivery Charge:", summaryX + 20, summaryY + 35)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("TOTAL:", summaryX + 20, summaryY + 65);

    const deliveryCharge = order.total > 8000 ? 0 : 200;

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`₹${totalAmount.toFixed(2)}`, summaryX + 150, summaryY + 15, {
        align: "right",
      })
      .text(`₹${deliveryCharge.toFixed(2)}`, summaryX + 150, summaryY + 35, {
        align: "right",
      });

    if (order.discount > 0) {
      doc
        .fillColor(accentColor)
        .text("Discount:", summaryX + 20, summaryY + 55)
        .text(`-₹${order.discount.toFixed(2)}`, summaryX + 150, summaryY + 55, {
          align: "right",
        });
    }

    doc
      .fillColor(primaryColor)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(`₹${order.total.toFixed(2)}`, summaryX + 150, summaryY + 65, {
        align: "right",
      });

    const footerY = doc.page.height - 100;

    doc.rect(50, footerY, 500, 50).lineWidth(1).fillColor(primaryColor).fill();

    doc
      .fillColor("white")
      .fontSize(10)
      .font("Helvetica")
      .text("Thank you for shopping with ELITE WEAR!", 0, footerY + 15, {
        align: "center",
      })
      .fontSize(8)
      .text(
        "For any questions regarding your order, please contact our customer service.",
        0,
        footerY + 30,
        { align: "center" }
      );

    doc
      .rect(50, y + 20, 200, 100)
      .lineWidth(1)
      .stroke(mediumGray);

    doc
      .fontSize(10)
      .fillColor(darkGray)
      .text("Scan to verify purchase", 75, y + 60, {
        align: "center",
        width: 150,
      });

    doc.end();
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
};
