const Cart = require("../../model/cartScheema");
const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Address = require("../../model/AddressScheema");
const Category = require("../../model/categoryScheema");
const Coupon = require("../../model/couponScheema");
const Wallet = require("../../model/walletScheema");

const loadcheckOut = async (req, res) => {
  try {
    const userId = req.user._id;

    const userCart = await Cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      delete req.session.checkout;
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const validItems = [];
    for (const item of userCart.items) {
      const product = item.productId;
      if (!product || !product.isActive) continue;

      const category = await Category.findById(product.categoryId);
      if (!category || !category.isListed) continue;

      validItems.push(item);
    }

    userCart.items = validItems;
    await userCart.save();

    if (!userCart.items.length) {
      delete req.session.checkout;
      req.flash(
        "warning",
        "Some items were removed from your cart. Please shop again."
      );
      return res.redirect("/");
    }

    const userAddresses = await Address.find({ userId });

    const cartItems = userCart.items;
    let totalPrice = 0;
    for (const item of cartItems) {
      const productPrice =
        item.productId.variants.find((v) => v.size === item.size)?.salePrice ||
        0;
      totalPrice += productPrice * item.quantity;
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const discount = req.session.checkout?.coupon?.discount || 0;
    const grandTotal = totalPrice - discount + deliveryCharge;

    if (!req.session.checkout) {
      req.session.checkout = {};
    }
    req.session.checkout.totalPrice = totalPrice;
    req.session.checkout.grandTotal = grandTotal; // Store the grand total for later use

    const today = new Date();
    const coupons = await Coupon.find({}).lean();
    const couponsWithStatus = coupons.map((coupon) => {
      const usedBy = coupon.usedBy || [];
      const userUsage = usedBy.find(
        (u) => u && u.userId && u.userId.toString() === userId.toString()
      );

      const isExpired = new Date(coupon.expiryDate) < today;
      const notStarted = new Date(coupon.startingDate) > today;
      const isUsed = userUsage && userUsage.usedCount >= coupon.limit;
      const isActive =
        coupon.isActive && !isExpired && new Date(coupon.startingDate) <= today;

      return {
        ...coupon,
        status: isUsed
          ? "used"
          : isExpired
          ? "expired"
          : notStarted
          ? "upcoming"
          : isActive
          ? "available"
          : "inactive",
        statusText: isUsed
          ? "Already Used"
          : isExpired
          ? "Expired"
          : notStarted
          ? "Not Started Yet"
          : isActive
          ? "Available"
          : "Inactive",
        isEligible: isActive && !isUsed && coupon.minimumPurchase <= totalPrice,
        userUsageCount: userUsage ? userUsage.usedCount : 0,
        remainingUses: userUsage
          ? Math.max(0, coupon.limit - userUsage.usedCount)
          : coupon.limit,
      };
    });

    res.render("checkOutpage", {
      cartItems,
      totalPrice,
      deliveryCharge,
      discount,
      grandTotal,
      addresses: userAddresses,
      orderNumber: `2406`,
      user: req.user,
      appliedCoupon: req.session.checkout?.coupon || null,
      coupons: couponsWithStatus,
    });
  } catch (error) {
    console.error("Unable to load the checkout page:", error);
    res.status(500).json({ success: false, message: "Server issue" });
  }
};

const selectDeliveryAddress = async (req, res) => {
  try {
    const { addressId } = req.body;
    const userId = req.user._id;

    const selectedAddress = await Address.findOne({ _id: addressId, userId });
    if (!selectedAddress) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address" });
    }

    req.session.checkout = req.session.checkout || {};
    req.session.checkout.addressId = addressId;

    return res.status(200).json({ success: true, message: "Address selected" });
  } catch (error) {
    console.error("Error selecting delivery address:", error);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

// New function to check wallet balance
const checkWalletBalance = async (userId) => {
  try {
    const user = await User.findById(userId).select("+walletBalance");
    if (!user) {
      return { success: false, message: "User not found", balance: 0 };
    }

    return {
      success: true,
      balance: user.walletBalance || 0,
      hasWallet: true
    };
  } catch (error) {
    console.error("Error checking wallet balance:", error);
    return { success: false, message: "Failed to retrieve wallet balance", balance: 0 };
  }
};

const loadCheckoutPayment = async (req, res) => {
  try {
    const userId = req.user._id;

    const userCart = await Cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      req.flash("warning", "Your cart is empty. Please shop again.");
      return res.redirect("/");
    }

    const validItems = [];
    for (const item of userCart.items) {
      const product = item.productId;
      if (!product || !product.isActive) {
        continue;
      }

      const category = await Category.findById(product.categoryId);
      if (!category || !category.isListed) {
        continue;
      }

      validItems.push(item);
    }

    userCart.items = validItems;
    await userCart.save();

    if (!userCart.items.length) {
      req.flash(
        "warning",
        "Some items were removed from your cart. Please shop again."
      );
      return res.redirect("/");
    }

    const cartItems = userCart.items;
    let totalPrice = 0;
    for (const item of cartItems) {
      const productPrice =
        item.productId.variants.find((v) => v.size === item.size)?.salePrice ||
        0;
      totalPrice += productPrice * item.quantity;
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const discount = req.session.checkout?.coupon?.discount || 0;
    const grandTotal = totalPrice - discount + deliveryCharge;

    // Store in session for order placement
    req.session.checkout = req.session.checkout || {};
    req.session.checkout.grandTotal = grandTotal;

    let deliveryAddress = null;
    if (req.session.checkout?.addressId) {
      deliveryAddress = await Address.findOne({
        _id: req.session.checkout.addressId,
        userId,
      });
    }

    if (!deliveryAddress) {
      req.flash("warning", "Please select a delivery address.");
      return res.redirect("/checkOut");
    }

    // Get wallet balance from Wallet collection
    let walletBalance = 0;
    const wallet = await Wallet.findOne({ userId });
    if (wallet) {
      walletBalance = wallet.amount;
    }

    res.render("checkoutPayment", {
      cartItems,
      totalPrice,
      deliveryCharge,
      discount,
      grandTotal,
      user: req.user,
      appliedCoupon: req.session.checkout?.coupon || null,
      deliveryAddress,
      walletBalance, // Pass the wallet balance from Wallet collection
      hasWalletBalance: walletBalance >= grandTotal,
      showWalletOption: true // Always show wallet option, will be disabled if insufficient funds
    });
  } catch (error) {
    console.error("Error loading checkout payment page:", error);
    res.status(500).send("Server issue");
  }
};

// New function to validate payment method
const validatePaymentMethod = async (req, res) => {
  try {
    const { paymentMethod } = req.body;
    const userId = req.user._id;
    
    if (!["COD", "Wallet"].includes(paymentMethod)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid payment method" 
      });
    }

    if (paymentMethod === "Wallet") {
      const grandTotal = req.session.checkout?.grandTotal || 0;
      
      // Fetch the wallet document
      const wallet = await Wallet.findOne({ userId });
      
      if (!wallet) {
        return res.status(400).json({ 
          success: false, 
          message: "Wallet not found" 
        });
      }
      
      // Convert both to numbers with 2 decimal places for accurate comparison
      const walletAmount = parseFloat(parseFloat(wallet.amount).toFixed(2));
      const grandTotalAmount = parseFloat(parseFloat(grandTotal).toFixed(2));
      
      if (walletAmount < grandTotalAmount) {
        return res.status(400).json({ 
          success: false, 
          message: "Insufficient wallet balance",
          currentBalance: walletAmount,
          required: grandTotalAmount 
        });
      }
    }
    
    // Store the validated payment method in session
    req.session.checkout = req.session.checkout || {};
    req.session.checkout.paymentMethod = paymentMethod;
    
    return res.status(200).json({ 
      success: true, 
      message: `${paymentMethod} payment method selected`,
      redirect: "/confirm-order" // Optional: redirect to order confirmation
    });
  } catch (error) {
    console.error("Error validating payment method:", error);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

// New function to show a summary/confirmation before placing order
const loadOrderConfirmation = async (req, res) => {
  try {
    const userId = req.user._id;
    
    if (!req.session.checkout?.addressId || !req.session.checkout?.paymentMethod) {
      req.flash("warning", "Please complete your checkout process");
      return res.redirect("/checkout");
    }
    
    const userCart = await Cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      req.flash("warning", "Your cart is empty");
      return res.redirect("/");
    }
    
    const deliveryAddress = await Address.findOne({
      _id: req.session.checkout.addressId,
      userId,
    });
    
    if (!deliveryAddress) {
      req.flash("warning", "Please select a delivery address");
      return res.redirect("/checkout");
    }
    
    const paymentMethod = req.session.checkout.paymentMethod;
    const totalPrice = req.session.checkout.totalPrice || 0;
    const discount = req.session.checkout.coupon?.discount || 0;
    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const grandTotal = totalPrice - discount + deliveryCharge;
    
    // Get wallet info if wallet payment
    let walletInfo = null;
    if (paymentMethod === "Wallet") {
      walletInfo = await checkWalletBalance(userId);
    }
    
    res.render("orderConfirmation", {
      cartItems: userCart.items,
      totalPrice,
      discount,
      deliveryCharge,
      grandTotal,
      deliveryAddress,
      paymentMethod,
      walletInfo: paymentMethod === "Wallet" ? walletInfo : null,
      appliedCoupon: req.session.checkout?.coupon || null,
      user: req.user
    });
  } catch (error) {
    console.error("Error loading order confirmation:", error);
    res.status(500).send("Server issue");
  }
};

module.exports = {
  loadcheckOut,
  selectDeliveryAddress,
  loadCheckoutPayment,
  validatePaymentMethod,
  loadOrderConfirmation,
  checkWalletBalance // Export so it can be used in other controllers
};