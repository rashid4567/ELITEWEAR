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
    console.log(`[DEBUG] updateOrderStatusHelper called for orderId: ${orderId}`)
    const order = await Order.findById(orderId)
    if (!order) {
      console.log(`[DEBUG] Order not found with ID: ${orderId}`)
      return
    }


    const orderItems = await OrderItem.find({ orderId: order._id })

    if (orderItems.length === 0) {
      console.log(`[DEBUG] No order items found for order: ${orderId}`)
      return
    }

  
    const statusCounts = {}
    for (const item of orderItems) {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1
    }

    console.log(`[DEBUG] Status counts for order ${orderId}:`, statusCounts)
    const totalItems = orderItems.length

 
    let newStatus = order.status


    const allSameStatus = Object.keys(statusCounts).length === 1
    if (allSameStatus) {
      newStatus = Object.keys(statusCounts)[0]
      console.log(`[DEBUG] All items have same status: ${newStatus}`)
    }

    else if (statusCounts["Cancelled"] && statusCounts["Cancelled"] < totalItems) {
      newStatus = "Partially Cancelled"
      console.log(`[DEBUG] Some items cancelled: ${statusCounts["Cancelled"]}/${totalItems}`)
    }

    else if (
      (statusCounts["Returned"] || statusCounts["Return Requested"] || statusCounts["Return Approved"]) &&
      (statusCounts["Returned"] || 0) +
        (statusCounts["Return Requested"] || 0) +
        (statusCounts["Return Approved"] || 0) <
        totalItems
    ) {
      newStatus = "Partially Returned"
      console.log(`[DEBUG] Some items in return process`)
    }
    
    else if (Object.keys(statusCounts).length > 1) {

      if (statusCounts["Delivered"]) {
        newStatus = "Partially Delivered"
        console.log(`[DEBUG] Some items delivered, others in different states`)
      }
      
      else if (statusCounts["Shipped"]) {
        newStatus = "Partially Shipped"
        console.log(`[DEBUG] Some items shipped, others in different states`)
      }
    }


    if (newStatus !== order.status) {
      console.log(`[DEBUG] Updating order status from ${order.status} to ${newStatus}`)
      order.status = newStatus


      if (!order.statusHistory) {
        order.statusHistory = []
      }

      order.statusHistory.push({
        status: newStatus,
        date: new Date(),
        note: `Status updated to ${newStatus} based on item statuses`,
      })
      await order.save()
      console.log(`[DEBUG] Order status updated successfully`)
    } else {
      console.log(`[DEBUG] Order status remains unchanged: ${order.status}`)
    }

    return newStatus
  } catch (error) {
    console.error("[ERROR] Error updating order status:", error)
    throw error
  }
}

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
        }
      ]
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
        itemImage: item.productId.images && item.productId.images.length > 0 
          ? item.productId.images[0].url 
          : null,
        status: "Processing",
        statusHistory: [
          {
            status: "Processing",
            date: new Date(),
            note: "Order item created",
          }
        ]
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

    const orderItems = await OrderItem.find({ orderId: order._id }).populate("productId");

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
          note: "Some items have different statuses. Check order details for more information."
        }
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
    console.log(`[DEBUG] cancelOrderItem called with params:`, req.params)
    console.log(`[DEBUG] cancelOrderItem body:`, req.body)


    const itemId = req.params.itemId || req.params.orderItemId

    if (!itemId) {
      console.log(`[DEBUG] No item ID provided in request`)
      return res.status(400).json({ success: false, message: "Item ID is required" })
    }

    const userId = req.session.user || req.user._id
    const { cancelReason } = req.body

    console.log(`[DEBUG] Processing cancel for item: ${itemId}, user: ${userId}`)

    if (!cancelReason) {
      console.log(`[DEBUG] Cancel reason not provided`)
      return res.status(400).json({ success: false, message: "Cancellation reason is required" })
    }


    const orderItem = await OrderItem.findById(itemId)
    if (!orderItem) {
      console.log(`[DEBUG] Order item not found: ${itemId}`)
      return res.status(404).json({ success: false, message: "Order item not found" })
    }

    console.log(`[DEBUG] Found order item:`, {
      id: orderItem._id,
      product: orderItem.product_name,
      status: orderItem.status,
    })


    const order = await Order.findById(orderItem.orderId)
    if (!order) {
      console.log(`[DEBUG] Parent order not found for item: ${itemId}`)
      return res.status(404).json({ success: false, message: "Parent order not found" })
    }

 
    if (order.userId.toString() !== userId.toString()) {
      console.log(`[DEBUG] Unauthorized access. Order user: ${order.userId}, Request user: ${userId}`)
      return res.status(403).json({ success: false, message: "Unauthorized access to this order" })
    }


    if (!["Processing", "Pending"].includes(orderItem.status)) {
      console.log(`[DEBUG] Item cannot be cancelled. Current status: ${orderItem.status}`)
      return res.status(400).json({
        success: false,
        message: "This item cannot be cancelled in its current status",
      })
    }

   
    orderItem.status = "Cancelled"
    orderItem.cancelReason = cancelReason
    orderItem.cancelledAt = new Date()

  
    if (!orderItem.statusHistory) {
      orderItem.statusHistory = []
    }

    orderItem.statusHistory.push({
      status: "Cancelled",
      date: new Date(),
      note: `Cancelled by user. Reason: ${cancelReason}`,
    })

    await orderItem.save()
    console.log(`[DEBUG] Order item status updated to Cancelled`)

  
    const product = await Product.findById(orderItem.productId)
    if (product) {
      const variantIndex = product.variants.findIndex((v) => v.size === orderItem.size)
      if (variantIndex !== -1) {
        console.log(
          `[DEBUG] Restoring stock for product: ${product.name}, size: ${orderItem.size}, quantity: ${orderItem.quantity}`,
        )
        product.variants[variantIndex].varientquatity += orderItem.quantity
        await product.save()
        console.log(`[DEBUG] Stock restored successfully`)
      } else {
        console.log(`[DEBUG] Product variant not found for size: ${orderItem.size}`)
      }
    } else {
      console.log(`[DEBUG] Product not found: ${orderItem.productId}`)
    }

 
    const refundAmount = orderItem.total_amount
    console.log(`[DEBUG] Refund amount calculated: ${refundAmount}`)


    if (order.paymentStatus === "Paid" || order.paymentMethod === "Wallet" || order.paymentMethod === "Online") {
      console.log(`[DEBUG] Processing refund to wallet. Payment method: ${order.paymentMethod}`)
      await processRefundToWallet(
        userId,
        refundAmount,
        order.orderNumber,
        `Refund for cancelled item: ${orderItem.product_name}`,
      )
      orderItem.refunded = true
      orderItem.refundAmount = refundAmount
      orderItem.refundDate = new Date()
      await orderItem.save()
      console.log(`[DEBUG] Refund processed successfully`)
    } else {
      console.log(`[DEBUG] No refund needed for payment method: ${order.paymentMethod}`)
    }


    console.log(`[DEBUG] Updating parent order status`)
    const newOrderStatus = await updateOrderStatusHelper(order._id)
    console.log(`[DEBUG] Parent order status updated to: ${newOrderStatus}`)

    return res.status(200).json({
      success: true,
      message: "Item cancelled successfully",
      refundAmount: refundAmount,
    })
  } catch (error) {
    console.error("[ERROR] Error cancelling order item:", error)
    return res.status(500).json({ success: false, message: "Failed to cancel item" })
  }
}


const returnOrderItem = async (req, res) => {
  try {
    console.log(`[DEBUG] returnOrderItem called with params:`, req.params)
    console.log(`[DEBUG] returnOrderItem body:`, req.body)


    const itemId = req.params.itemId || req.params.orderItemId

    if (!itemId) {
      console.log(`[DEBUG] No item ID provided in request`)
      return res.status(400).json({ success: false, message: "Item ID is required" })
    }

    const userId = req.session.user || req.user._id
    const { returnReason } = req.body

    console.log(`[DEBUG] Processing return for item: ${itemId}, user: ${userId}`)

    if (!returnReason) {
      console.log(`[DEBUG] Return reason not provided`)
      return res.status(400).json({ success: false, message: "Return reason is required" })
    }


    const orderItem = await OrderItem.findById(itemId)
    if (!orderItem) {
      console.log(`[DEBUG] Order item not found: ${itemId}`)
      return res.status(404).json({ success: false, message: "Order item not found" })
    }

    console.log(`[DEBUG] Found order item:`, {
      id: orderItem._id,
      product: orderItem.product_name,
      status: orderItem.status,
    })


    const order = await Order.findById(orderItem.orderId)
    if (!order) {
      console.log(`[DEBUG] Parent order not found for item: ${itemId}`)
      return res.status(404).json({ success: false, message: "Parent order not found" })
    }

 
    if (order.userId.toString() !== userId.toString()) {
      console.log(`[DEBUG] Unauthorized access. Order user: ${order.userId}, Request user: ${userId}`)
      return res.status(403).json({ success: false, message: "Unauthorized access to this order" })
    }


    if (orderItem.status !== "Delivered") {
      console.log(`[DEBUG] Item cannot be returned. Current status: ${orderItem.status}`)
      return res.status(400).json({
        success: false,
        message: "Only delivered items can be returned",
      })
    }

 
    const deliveryDate = order.deliveryDate || order.updatedAt || order.orderDate
    const returnPeriod = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - deliveryDate.getTime() > returnPeriod) {
      console.log(`[DEBUG] Return period expired. Delivery date: ${deliveryDate}, Current date: ${new Date()}`)
      return res.status(400).json({ success: false, message: "Return period has expired (14 days)" })
    }

    orderItem.status = "Return Requested"
    orderItem.returnReason = returnReason
    orderItem.returnRequestedDate = new Date()

    if (!orderItem.statusHistory) {
      orderItem.statusHistory = []
    }

    orderItem.statusHistory.push({
      status: "Return Requested",
      date: new Date(),
      note: `Return requested by user. Reason: ${returnReason}`,
    })

    await orderItem.save()
    console.log(`[DEBUG] Order item status updated to Return Requested`)


    console.log(`[DEBUG] Updating parent order status`)
    const newOrderStatus = await updateOrderStatusHelper(order._id)
    console.log(`[DEBUG] Parent order status updated to: ${newOrderStatus}`)

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
    })
  } catch (error) {
    console.error("[ERROR] Error requesting return for order item:", error)
    return res.status(500).json({ success: false, message: "Failed to submit return request" })
  }
}

const cancelOrder = async (req, res) => {
  try {
    console.log(`[DEBUG] cancelOrder called with params:`, req.params)
    console.log(`[DEBUG] cancelOrder body:`, req.body)

    const userId = req.session.user || req.user._id
    const orderId = req.params.id
    const { cancelReason } = req.body

    console.log(`[DEBUG] Processing cancel for order: ${orderId}, user: ${userId}`)

    const order = await Order.findOne({
      _id: orderId,
      userId,
    })

    if (!order) {
      console.log(`[DEBUG] Order not found: ${orderId}`)
      return res.status(404).json({ success: false, message: "Order not found" })
    }

    if (!["Pending", "Processing"].includes(order.status)) {
      console.log(`[DEBUG] Order cannot be cancelled. Current status: ${order.status}`)
      return res.status(400).json({ success: false, message: "This order cannot be cancelled" })
    }

 
    const orderItems = await OrderItem.find({ orderId: order._id })
    console.log(`[DEBUG] Found ${orderItems.length} items to cancel`)

    for (const item of orderItems) {
      console.log(`[DEBUG] Cancelling item: ${item._id}, ${item.product_name}`)
      item.status = "Cancelled"
      item.cancelReason = cancelReason || "Cancelled by user"
      item.cancelledAt = new Date()

    
      if (!item.statusHistory) {
        item.statusHistory = []
      }

      item.statusHistory.push({
        status: "Cancelled",
        date: new Date(),
        note: `Cancelled as part of full order cancellation. Reason: ${cancelReason || "Cancelled by user"}`,
      })
      await item.save()
      console.log(`[DEBUG] Item ${item._id} cancelled successfully`)
    }

    order.status = "Cancelled"
    order.cancelReason = cancelReason || "Cancelled by user"

 
    if (!order.statusHistory) {
      order.statusHistory = []
    }

    order.statusHistory.push({
      status: "Cancelled",
      date: new Date(),
      note: `Order cancelled by user. Reason: ${cancelReason || "Cancelled by user"}`,
    })
    await order.save()
    console.log(`[DEBUG] Order status updated to Cancelled`)

    for (const item of orderItems) {
      const product = await Product.findById(item.productId)
      if (product) {
        const variantIndex = product.variants.findIndex((v) => v.size === item.size)
        if (variantIndex !== -1) {
          console.log(
            `[DEBUG] Restoring stock for product: ${product.name}, size: ${item.size}, quantity: ${item.quantity}`,
          )
          product.variants[variantIndex].varientquatity += item.quantity
          await product.save()
          console.log(`[DEBUG] Stock restored successfully for item ${item._id}`)
        } else {
          console.log(`[DEBUG] Product variant not found for size: ${item.size}`)
        }
      } else {
        console.log(`[DEBUG] Product not found: ${item.productId}`)
      }
    }


    if (order.paymentMethod === "COD" && order.paymentStatus === "Paid") {
      console.log(`[DEBUG] Processing refund for COD order with Paid status`)
      await processRefundToWallet(userId, order.total, order.orderNumber, "Refund for cancelled order")
      order.paymentStatus = "Refunded"
      order.refunded = true
      await order.save()
      console.log(`[DEBUG] Refund processed successfully`)
    } else if (order.paymentMethod === "Wallet") {
      console.log(`[DEBUG] Processing refund for Wallet payment`)
      await processRefundToWallet(userId, order.total, order.orderNumber, "Refund for cancelled order")
      order.paymentStatus = "Refunded"
      order.refunded = true
      await order.save()
      console.log(`[DEBUG] Refund processed successfully`)
    } else if (order.paymentMethod === "Online") {
      console.log(`[DEBUG] Processing refund for Online payment`)
      await processRefundToWallet(userId, order.total, order.orderNumber, "Refund for cancelled order")
      order.paymentStatus = "Refunded"
      order.refunded = true
      await order.save()
      console.log(`[DEBUG] Refund processed successfully`)
    } else {
      console.log(`[DEBUG] No refund needed for payment method: ${order.paymentMethod}`)
    }

    return res.status(200).json({ success: true, message: "Order cancelled successfully" })
  } catch (error) {
    console.error("[ERROR] Error cancelling order:", error)
    return res.status(500).json({ success: false, message: "Failed to cancel order" })
  }
}

const initiateReturn = async (req, res) => {
  try {
    console.log(`[DEBUG] initiateReturn called with params:`, req.params)
    console.log(`[DEBUG] initiateReturn body:`, req.body)

    const userId = req.session.user || req.user._id
    const orderId = req.params.id
    const { returnReason } = req.body

    console.log(`[DEBUG] Processing return for order: ${orderId}, user: ${userId}`)

    if (!returnReason) {
      console.log(`[DEBUG] Return reason not provided`)
      return res.status(400).json({ success: false, message: "Return reason is required" })
    }

    const order = await Order.findOne({
      _id: orderId,
      userId,
    })

    if (!order) {
      console.log(`[DEBUG] Order not found: ${orderId}`)
      return res.status(404).json({ success: false, message: "Order not found" })
    }

    if (order.status !== "Delivered") {
      console.log(`[DEBUG] Order cannot be returned. Current status: ${order.status}`)
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      })
    }

    const deliveryDate = order.deliveryDate || order.updatedAt || order.orderDate
    const returnPeriod = 14 * 24 * 60 * 60 * 1000
    if (Date.now() - deliveryDate.getTime() > returnPeriod) {
      console.log(`[DEBUG] Return period expired. Delivery date: ${deliveryDate}, Current date: ${new Date()}`)
      return res.status(400).json({
        success: false,
        message: "Return period has expired (14 days)",
      })
    }

 
    const orderItems = await OrderItem.find({ orderId: order._id })
    console.log(`[DEBUG] Found ${orderItems.length} items to return`)

    for (const item of orderItems) {
      if (item.status === "Delivered") {
        console.log(`[DEBUG] Requesting return for item: ${item._id}, ${item.product_name}`)
        item.status = "Return Requested"
        item.returnReason = returnReason
        item.returnRequestedDate = new Date()

 
        if (!item.statusHistory) {
          item.statusHistory = []
        }

        item.statusHistory.push({
          status: "Return Requested",
          date: new Date(),
          note: `Return requested as part of full order return. Reason: ${returnReason}`,
        })
        await item.save()
        console.log(`[DEBUG] Item ${item._id} return requested successfully`)
      } else {
        console.log(`[DEBUG] Skipping item ${item._id} with status ${item.status}`)
      }
    }

    order.status = "Return Requested"
    order.returnReason = returnReason
    order.returnRequestedDate = new Date()

  
    if (!order.statusHistory) {
      order.statusHistory = []
    }

    order.statusHistory.push({
      status: "Return Requested",
      date: new Date(),
      note: `Return requested by user. Reason: ${returnReason}`,
    })
    await order.save()
    console.log(`[DEBUG] Order status updated to Return Requested`)

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
    })
  } catch (error) {
    console.error("[ERROR] Error initiating return:", error)
    return res.status(500).json({ success: false, message: "Failed to submit return request" })
  }
}

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

    const doc = new PDFDocument({ margin: 50 });
    const invoiceFilename = `invoice-${order.orderNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoiceFilename}"`
    );

    doc.pipe(res);

    // doc.image(path.join(__dirname, '../../public/Uploads/logo.png'), 50, 45, { width: 100 });

    doc.fontSize(20).text("ELITE WEAR", { align: "center" });
    doc.fontSize(12).text("Invoice", { align: "center" });
    doc.moveDown();

    doc.fontSize(14).text("Order Details", { underline: true });
    doc.fontSize(10).text(`Order Number: ${order.orderNumber}`);
    doc.text(`Order Date: ${order.orderDate.toLocaleDateString()}`);
    doc.text(`Payment Method: ${order.paymentMethod}`);
    doc.text(`Payment Status: ${order.paymentStatus}`);
    doc.moveDown();

    doc.fontSize(14).text("Customer Details", { underline: true });
    doc.fontSize(10).text(`Name: ${order.userId.fullname}`);
    doc.text(`Email: ${order.userId.email}`);
    doc.moveDown();

    doc.fontSize(14).text("Shipping Address", { underline: true });
    doc.fontSize(10).text(`${address.fullname}`);
    doc.text(`${address.address}`);
    doc.text(`${address.city}, ${address.district}`);
    doc.text(`${address.state} - ${address.pincode}`);
    doc.text(`Phone: ${address.mobile}`);
    doc.moveDown();

    doc.fontSize(14).text("Order Items", { underline: true });
    doc.moveDown();

    const tableTop = doc.y;
    const itemX = 50;
    const descriptionX = 150;
    const quantityX = 300;
    const priceX = 370;
    const amountX = 450;

    doc
      .fontSize(10)
      .text("Item", itemX, tableTop)
      .text("Description", descriptionX, tableTop)
      .text("Qty", quantityX, tableTop)
      .text("Price", priceX, tableTop)
      .text("Amount", amountX, tableTop);

    doc.moveDown();

    doc
      .strokeColor("#aaaaaa")
      .lineWidth(1)
      .moveTo(itemX, doc.y)
      .lineTo(550, doc.y)
      .stroke();

    doc.moveDown();

    let totalAmount = 0;
    let y = doc.y;

    for (const item of orderItems) {
      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      doc
        .fontSize(10)
        .text(item.product_name.substring(0, 20), itemX, y)
        .text(`Size: ${item.size}`, descriptionX, y)
        .text(item.quantity, quantityX, y)
        .text(`₹${item.price.toFixed(2)}`, priceX, y)
        .text(`₹${itemTotal.toFixed(2)}`, amountX, y);

      y += 20;
    }

    doc.moveDown();

    doc
      .strokeColor("#aaaaaa")
      .lineWidth(1)
      .moveTo(itemX, doc.y)
      .lineTo(550, doc.y)
      .stroke();

    doc.moveDown();

    const subtotalY = doc.y;
    doc
      .fontSize(10)
      .text("Subtotal:", 350, subtotalY)
      .text(`₹${totalAmount.toFixed(2)}`, amountX, subtotalY);

    const deliveryY = subtotalY + 20;
    doc
      .fontSize(10)
      .text("Delivery Charge:", 350, deliveryY)
      .text(
        `₹${(order.total > 8000 ? 0 : 200).toFixed(2)}`,
        amountX,
        deliveryY
      );

    if (order.discount > 0) {
      const discountY = deliveryY + 20;
      doc
        .fontSize(10)
        .text("Discount:", 350, discountY)
        .text(`-₹${order.discount.toFixed(2)}`, amountX, discountY);
    }

    const totalY = order.discount > 0 ? deliveryY + 40 : deliveryY + 20;
    doc
      .fontSize(12)
      .text("Total:", 350, totalY, { bold: true })
      .text(`₹${order.total.toFixed(2)}`, amountX, totalY, { bold: true });

    doc.fontSize(10).text("Thank you for shopping with ELITE WEAR!", 50, 700, {
      align: "center",
    });

    doc.end();
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.redirect("/orders");
  }
};
const checkItemUpdateability = async (req, res) => {
  try {
    const { orderItemId } = req.params
    const userId = req.session.user || req.user._id

    const orderItem = await OrderItem.findById(orderItemId).populate({
      path: "orderId",
      select: "userId",
    })

    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      })
    }

    // Check if this item belongs to the current user
    if (orderItem.orderId.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access this order item",
      })
    }

    const finalStates = ["Cancelled", "Returned"]
    const canUpdate = !finalStates.includes(orderItem.status)

    return res.status(200).json({
      success: true,
      canUpdate,
      status: orderItem.status,
      isFinalState: finalStates.includes(orderItem.status),
    })
  } catch (error) {
    console.error("Error checking item updateability:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to check item updateability: " + error.message,
    })
  }
}

const checkOrderUpdateability = async (req, res) => {
  try {
    const { orderId } = req.params
    const userId = req.session.user || req.user._id

    let order
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId)
    } else {
      order = await Order.findOne({ orderNumber: orderId })
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      })
    }

    // Check if this order belongs to the current user
    if (order.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access this order",
      })
    }

    const finalStates = ["Cancelled", "Returned"]
    const canUpdate = !finalStates.includes(order.status)

    return res.status(200).json({
      success: true,
      canUpdate,
      status: order.status,
      isFinalState: finalStates.includes(order.status),
    })
  } catch (error) {
    console.error("Error checking order updateability:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to check order updateability: " + error.message,
    })
  }
}

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