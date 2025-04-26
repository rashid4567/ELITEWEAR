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
    console.error(
      "Razorpay credentials missing. Please check your environment variables."
    );
  }
 
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// Create Razorpay order
const createRazorpayOrder = async (req, res) => {
  try {
    let razorpayInstance;
    try {
      razorpayInstance = getRazorpayInstance();
    } catch (error) {
      console.error("Razorpay initialization error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Payment gateway configuration error. Please contact support.",
      });
    }

    const userId = req.session.user || req.user._id;
    const { couponCode } = req.body;

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
        return res
          .status(400)
          .json({
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
        return res
          .status(400)
          .json({
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
        return res
          .status(400)
          .json({
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

    const options = {
      amount: Math.round(grandTotal * 100),
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);

    req.session.razorpayOrder = {
      orderId: razorpayOrder.id,
      amount: grandTotal,
      couponCode: couponCode || null,
      discount: discount,
      addressId: addressId,
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
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
   
    const userId = req.session.user || req.user._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

  

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
   
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }

    const orderDetails = req.session.razorpayOrder;
    if (!orderDetails || orderDetails.orderId !== razorpay_order_id) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order details" });
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


    const orderNumber = generateOrderNumber();
    const newOrder = new Order({
      userId: userId,
      orderNumber,
      paymentMethod: "Online",
      address: orderDetails.addressId,
      total: orderDetails.amount,
      discount: orderDetails.discount,
      paymentStatus: "Completed",
      orderDate: new Date(),
      status: "Processing",
      paymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
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

    req.session.lastOrderId = newOrder._id;

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
    });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyPayment,
};
