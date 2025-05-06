const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const Cart = require("../../model/cartScheema");
const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Coupon = require("../../model/couponScheema");
const {
  generateOrderNumber,
  generateTransactionId,
} = require("../../utils/helpers");
const { processRefundToWallet } = require("./walletController");

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("Razorpay credentials missing:", {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET ? "****" : undefined,
    });
    throw new Error(
      "Razorpay credentials missing. Please check environment variables."
    );
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const createRazorpayOrder = async (req, res) => {
  try {
    const razorpayInstance = getRazorpayInstance();
    const userId = req.session.user || req.user._id;
    const { couponCode } = req.body;

    console.log(
      "Creating Razorpay order for user:",
      userId,
      "Coupon:",
      couponCode
    );

    const user = await User.findById(userId);
    if (!user) {
      console.error("User not found:", userId);
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "name images variants",
    });
    if (!cart || cart.items.length === 0) {
      console.error("Cart is empty or not found for user:", userId);
      return res
        .status(400)
        .json({ success: false, message: "Your cart is empty" });
    }

    for (const item of cart.items) {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      if (!variant) {
        console.error(
          "Invalid variant for product:",
          item.productId.name,
          "Size:",
          item.size
        );
        return res.status(400).json({
          success: false,
          message: `Invalid variant for product ${item.productId.name}`,
        });
      }
      if (variant.varientquatity < item.quantity) {
        console.error(
          "Insufficient stock for product:",
          item.productId.name,
          "Size:",
          item.size,
          "Available:",
          variant.varientquatity,
          "Requested:",
          item.quantity
        );
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
        console.error("Invalid coupon code:", couponCode);
        return res
          .status(400)
          .json({ success: false, message: "Invalid coupon code" });
      }

      const now = new Date();
      if (
        now < new Date(coupon.startingDate) ||
        now > new Date(coupon.expiryDate)
      ) {
        console.error("Coupon expired or not yet valid:", couponCode);
        return res.status(400).json({
          success: false,
          message: "Coupon is not valid at this time",
        });
      }

      if (totalPrice < coupon.minimumPurchase) {
        console.error(
          "Minimum purchase not met for coupon:",
          couponCode,
          "Required:",
          coupon.minimumPurchase,
          "Actual:",
          totalPrice
        );
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${coupon.minimumPurchase} required for this coupon`,
        });
      }

      const userUsage = coupon.usedBy.find(
        (usage) => usage.userId.toString() === userId.toString()
      );
      if (userUsage && userUsage.usageCount >= coupon.limit) {
        console.error(
          "Coupon usage limit reached for user:",
          userId,
          "Coupon:",
          couponCode
        );
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
      console.error("Delivery address not selected for user:", userId);
      return res
        .status(400)
        .json({ success: false, message: "Delivery address not selected" });
    }

    const amountInPaise = Math.round(grandTotal * 100);
    if (amountInPaise <= 0) {
      console.error("Invalid order amount:", grandTotal);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order amount" });
    }

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
    };

    console.log("Razorpay order options:", options);

    let razorpayOrder;
    let retryCount = 0;
    const maxRetries = 3;
    while (retryCount < maxRetries) {
      try {
        razorpayOrder = await razorpayInstance.orders.create(options);
        console.log("Razorpay order created successfully:", razorpayOrder);
        break;
      } catch (razorpayError) {
        retryCount++;
        console.error(
          `Razorpay API error (attempt ${retryCount}):`,
          JSON.stringify(razorpayError, null, 2)
        );
        if (retryCount === maxRetries) {
          return res.status(500).json({
            success: false,
            message: `Razorpay error: ${
              razorpayError.error?.description || "Failed to create order"
            }`,
            details: razorpayError.error || razorpayError,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
      }
    }

    const orderNumber = generateOrderNumber();
    const pendingOrder = new Order({
      userId: userId,
      orderNumber,
      paymentMethod: "Online",
      address: addressId,
      total: grandTotal,
      discount: discount,
      paymentStatus: "Pending",
      orderDate: new Date(),
      status: "Pending",
      razorpayOrderId: razorpayOrder.id,
    });

    await pendingOrder.save();
    console.log("Pending order created:", pendingOrder._id);

    // Create order items
    const orderItems = [];
    for (const item of cart.items) {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      const orderItem = new OrderItem({
        productId: item.productId._id,
        orderId: pendingOrder._id,
        product_name: item.productId.name,
        quantity: item.quantity,
        size: item.size,
        price: variant.salePrice,
        total_amount: variant.salePrice * item.quantity,
        itemImage:
          item.productId.images && item.productId.images.length > 0
            ? item.productId.images[0].url
            : null,
        status: "Pending",
      });
      await orderItem.save();
      orderItems.push(orderItem._id);
    }

    pendingOrder.order_items = orderItems;
    await pendingOrder.save();

    req.session.razorpayOrder = {
      orderId: razorpayOrder.id,
      amount: grandTotal,
      couponCode: couponCode || null,
      discount: discount,
      addressId: addressId,
      pendingOrderId: pendingOrder._id,
    };

    return res.status(200).json({
      success: true,
      order: razorpayOrder,
      key: process.env.RAZORPAY_KEY_ID,
      user: {
        name: user.fullname || user.username,
        email: user.email,
        contact: user.mobile || "",
      },
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create payment order. Please try again.",
      details: error.message,
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    console.log("Verifying payment:", {
      razorpay_order_id,
      razorpay_payment_id,
    });

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("Invalid Razorpay signature:", {
        expectedSignature,
        razorpay_signature,
      });

      const pendingOrder = await Order.findOne({
        razorpayOrderId: razorpay_order_id,
        userId: userId,
      });

      if (pendingOrder) {
        pendingOrder.paymentStatus = "Failed";
        await pendingOrder.save();
      }

      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }

    const orderDetails = req.session.razorpayOrder;
    if (!orderDetails || orderDetails.orderId !== razorpay_order_id) {
      console.error("Invalid or missing session order details:", orderDetails);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order details" });
    }

    const pendingOrder = await Order.findOne({
      razorpayOrderId: razorpay_order_id,
      userId: userId,
    });

    if (!pendingOrder) {
      const pendingOrderId = orderDetails.pendingOrderId;
      if (pendingOrderId) {
        const order = await Order.findById(pendingOrderId);
        if (order) {
          order.paymentStatus = "Completed";
          order.status = "Processing";
          order.paymentId = razorpay_payment_id;

          if (!order.statusHistory) {
            order.statusHistory = [];
          }

          order.statusHistory.push({
            status: "Processing",
            date: new Date(),
            note: "Payment completed successfully",
          });

          await order.save();

          const orderItems = await OrderItem.find({ orderId: order._id });
          for (const item of orderItems) {
            item.status = "Processing";
            await item.save();

            const product = await Product.findById(item.productId);
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

          if (orderDetails.couponCode) {
            const coupon = await Coupon.findOne({
              coupencode: orderDetails.couponCode,
            });
            if (coupon) {
              const userIndex = coupon.usedBy.findIndex(
                (usage) => usage.userId.toString() === userId.toString()
              );
              if (userIndex !== -1) {
                coupon.usedBy[userIndex].usageCount += 1;
              } else {
                coupon.usedBy.push({ userId, usageCount: 1 });
              }
              await coupon.save();
            }
          }

          await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

          delete req.session.razorpayOrder;
          delete req.session.checkout;

          req.session.lastOrderId = order._id;

          return res.status(200).json({
            success: true,
            message: "Payment successful",
            redirect: "/order-success",
          });
        }
      }

      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    pendingOrder.paymentStatus = "Completed";
    pendingOrder.status = "Processing";
    pendingOrder.paymentId = razorpay_payment_id;

    if (!pendingOrder.statusHistory) {
      pendingOrder.statusHistory = [];
    }

    pendingOrder.statusHistory.push({
      status: "Processing",
      date: new Date(),
      note: "Payment completed successfully",
    });

    await pendingOrder.save();

    const orderItems = await OrderItem.find({ orderId: pendingOrder._id });
    for (const item of orderItems) {
      item.status = "Processing";
      await item.save();

      const product = await Product.findById(item.productId);
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

    if (orderDetails.couponCode) {
      const coupon = await Coupon.findOne({
        coupencode: orderDetails.couponCode,
      });
      if (coupon) {
        const userIndex = coupon.usedBy.findIndex(
          (usage) => usage.userId.toString() === userId.toString()
        );
        if (userIndex !== -1) {
          coupon.usedBy[userIndex].usageCount += 1;
        } else {
          coupon.usedBy.push({ userId, usageCount: 1 });
        }
        await coupon.save();
      }
    }

    await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

    delete req.session.razorpayOrder;
    delete req.session.checkout;

    req.session.lastOrderId = pendingOrder._id;

    console.log(
      "Payment verified and order processed successfully:",
      pendingOrder._id
    );

    return res.status(200).json({
      success: true,
      message: "Payment successful",
      redirect: "/order-success",
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed. Please contact support.",
      details: error.message,
    });
  }
};

const handleFailedPayment = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const razorpayOrderId = req.body.razorpay_order_id;

    const pendingOrder = await Order.findOne({
      razorpayOrderId: razorpayOrderId,
      userId: userId,
    });

    if (!pendingOrder) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    pendingOrder.paymentStatus = "Failed";
    await pendingOrder.save();

    return res.status(200).json({
      success: true,
      message: "Payment status updated to failed",
    });
  } catch (error) {
    console.error("Error handling failed payment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment status",
      details: error.message,
    });
  }
};

const retryRazorpayPayment = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.orderId;

    const failedOrder = await Order.findOne({
      _id: orderId,
      userId,
    });

    if (!failedOrder) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (
      failedOrder.paymentMethod !== "Online" ||
      (failedOrder.paymentStatus !== "Failed" &&
        failedOrder.paymentStatus !== "Pending")
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "This order is not eligible for payment retry",
        });
    }

    const razorpayInstance = getRazorpayInstance();

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const amountInPaise = Math.round(failedOrder.total * 100);
    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_retry_${Date.now()}`,
      payment_capture: 1,
      notes: {
        orderId: failedOrder._id.toString(),
        orderNumber: failedOrder.orderNumber,
        userId: userId.toString(),
      },
    };

    console.log("Retry payment - Razorpay order options:", options);

    const razorpayOrder = await razorpayInstance.orders.create(options);
    console.log("Retry payment - Razorpay order created:", razorpayOrder);

    failedOrder.razorpayOrderId = razorpayOrder.id;
    failedOrder.paymentRetryCount = (failedOrder.paymentRetryCount || 0) + 1;
    failedOrder.lastPaymentRetryDate = new Date();
    await failedOrder.save();

    req.session.razorpayOrder = {
      orderId: razorpayOrder.id,
      amount: failedOrder.total,
      couponCode: failedOrder.couponCode,
      discount: failedOrder.discount,
      addressId: failedOrder.address,
      pendingOrderId: failedOrder._id,
    };

    return res.status(200).json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
      user: {
        name: user.fullname || user.username || "Customer",
        email: user.email || "",
        contact: user.mobile || "",
      },
    });
  } catch (error) {
    console.error("Error retrying payment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retry payment. Please try again.",
      details: error.message,
    });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyPayment,
  handleFailedPayment,
  retryRazorpayPayment,
};
