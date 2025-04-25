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

      // Add transaction to wallet history
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

    const orderItems = await Promise.all(
      order.order_items.map(async (itemId) => {
        const item = await OrderItem.findById(itemId).populate("productId");
        return item;
      })
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

    order.status = "Cancelled";
    order.cancelReason = cancelReason || "Cancelled by user";
    order.updatedAt = new Date();
    await order.save();

    const orderItems = await OrderItem.find({ orderId: order._id });
    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (product) {
        const variantIndex = product.variants.findIndex(
          (v) => v.size === item.size
        );
        if (variantIndex !== -1) {
          product.variants[variantIndex].varientquatity += item.quantity;
          await product.save();
        }
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
    } else if (order.paymentMethod === "Wallet") {
      await processRefundToWallet(
        userId,
        order.total,
        order.orderNumber,
        "Refund for cancelled order"
      );
      order.paymentStatus = "Refunded";
      order.refunded = true;
    } else if (order.paymentMethod === "Online") {
      await processRefundToWallet(
        userId,
        order.total,
        order.orderNumber,
        "Refund for cancelled order"
      );
      order.paymentStatus = "Refunded";
      order.refunded = true;
    }

    await order.save();

    return res
      .status(200)
      .json({ success: true, message: "Order cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling order:", error);
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

    order.status = "Return Requested";
    order.returnReason = returnReason;
    order.returnRequestedDate = new Date();
    order.updatedAt = new Date();
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Error initiating return:", error);
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

module.exports = {
  placeOrder,
  loadOrderSuccess,
  getUserOrders,
  getOrderDetails,
  trackOrder,
  cancelOrder,
  initiateReturn,
  reOrder,
  downloadInvoice,
};
