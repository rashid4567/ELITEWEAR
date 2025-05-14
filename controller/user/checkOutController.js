const Cart = require("../../model/cartScheema");
const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Address = require("../../model/AddressScheema");
const Category = require("../../model/categoryScheema");
const Coupon = require("../../model/couponScheema");
const Wallet = require("../../model/walletScheema");
const logger = require("../../utils/logger");
const {
  calculateProportionalDiscount,
} = require("../../utils/discountCalculator");

const loadcheckOut = async (req, res) => {
  try {
    const userId = req.user._id;
    logger.info("Loading checkout page for user:", userId);

    const userCart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "name images variants isActive categoryId",
    });

    if (!userCart || !userCart.items.length) {
      delete req.session.checkout;
      return res.redirect("/cart?error=Cart is empty");
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

    const cartItems = userCart.items.map((item) => {
      if (!item.productId || typeof item.productId !== "object") {
        logger.info("Warning: Product not properly populated for item:", item);
        return {
          id: item.productId || "unknown",
          name: "Product Unavailable",
          size: item.size || "N/A",
          quantity: item.quantity || 1,
          price: 0,
          image: null,
          originalPrice: 0,
          discountedPrice: 0,
          discountAmount: 0,
        };
      }

      const variant = item.productId.variants.find((v) => v.size === item.size);
      const price = variant ? variant.salePrice : 0;

      return {
        id: item.productId._id,
        name: item.productId.name || "Unnamed Product",
        size: item.size || "N/A",
        quantity: item.quantity || 1,
        price: price,
        image:
          item.productId.images && item.productId.images.length > 0
            ? item.productId.images[0].url
            : null,
        originalPrice: price,
        discountedPrice: price,
        discountAmount: 0,
        productId: item.productId,
      };
    });

    const totalPrice = cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
    const deliveryCharge = totalPrice > 8000 ? 0 : 200;

    let discountResult = {
      cartItems: cartItems.map((item) => ({
        ...item,
        originalPrice: item.price,
        discountPerUnit: 0,
        discountAmount: 0,
        finalPrice: item.price,
      })),
      cartTotal: totalPrice,
      totalDiscount: 0,
      finalTotal: totalPrice,
      discountApplied: false,
      message: "No coupon applied",
    };

    if (req.session.checkout?.coupon) {
      logger.info("Found coupon in session:", req.session.checkout.coupon.code);
      const storedCoupon = req.session.checkout.coupon;

      const coupon = await Coupon.findById(storedCoupon.couponId);
      if (
        !coupon ||
        !coupon.isActive ||
        new Date() > new Date(coupon.expiryDate)
      ) {
        logger.info("Coupon is no longer valid, removing from session");
        delete req.session.checkout.coupon;
        req.session.save();
      } else {
        if (storedCoupon.items && storedCoupon.items.length > 0) {
          discountResult.cartItems = cartItems.map((item) => {
            const itemDiscount = storedCoupon.items.find(
              (i) => i.id && item.id && i.id.toString() === item.id.toString()
            );

            if (itemDiscount) {
              return {
                ...item,
                originalPrice: itemDiscount.originalPrice,
                discountPerUnit: itemDiscount.discountPerUnit,
                discountAmount: itemDiscount.discountAmount,
                finalPrice: itemDiscount.finalPrice,
                discountedPrice: itemDiscount.finalPrice,
              };
            }

            return {
              ...item,
              originalPrice: item.price,
              discountPerUnit: 0,
              discountAmount: 0,
              finalPrice: item.price,
              discountedPrice: item.price,
            };
          });

          discountResult.totalDiscount = storedCoupon.discount;
          discountResult.finalTotal = totalPrice - storedCoupon.discount;
          discountResult.discountApplied = true;
        }
      }
    }

    const grandTotal = discountResult.finalTotal + deliveryCharge;

    if (!req.session.checkout) {
      req.session.checkout = {};
    }
    req.session.checkout.totalPrice = totalPrice;
    req.session.checkout.grandTotal = grandTotal;
    req.session.checkout.deliveryCharge = deliveryCharge;
    req.session.checkout.discount = discountResult.totalDiscount;

    req.session.save((err) => {
      if (err) {
        logger.error("Error saving checkout session:", err);
      }
    });

    const today = new Date();
    const coupons = await Coupon.find({}).lean();
    const couponsWithStatus = coupons.map((coupon) => {
      const usedBy = coupon.usedBy || [];
      const userUsage = usedBy.find(
        (u) => u && u.userId && u.userId.toString() === userId.toString()
      );

      const isExpired = new Date(coupon.expiryDate) < today;
      const notStarted = new Date(coupon.startingDate) > today;
      const isUsed = userUsage && userUsage.usageCount >= coupon.limit;
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
        userUsageCount: userUsage ? userUsage.usageCount : 0,
        remainingUses: userUsage
          ? Math.max(0, coupon.limit - userUsage.usageCount)
          : coupon.limit,
      };
    });

    logger.warn("Sending to checkout template:", {
      cartItemsCount: userCart.items.length,
      discountedItemsCount: discountResult.cartItems.length,
      totalPrice,
      discount: discountResult.totalDiscount,
      grandTotal,
      appliedCoupon: req.session.checkout?.coupon || null,
    });

    res.render("checkOutpage", {
      cartItems: userCart.items,
      discountedItems: discountResult.cartItems,
      totalPrice,
      deliveryCharge,
      discount: discountResult.totalDiscount,
      grandTotal,
      addresses: userAddresses,
      orderNumber: `2406`,
      user: req.user,
      appliedCoupon: req.session.checkout?.coupon || null,
      coupons: couponsWithStatus,
    });
  } catch (error) {
    console.error("Unable to load the checkout page:", error);
    res.status(500).render("error", {
      message: "Failed to load checkout page. Please try again later.",
    });
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

    req.session.save((err) => {
      if (err) {
        console.error("Error saving address to session:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to save address selection",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Address selected successfully",
      });
    });
  } catch (error) {
    console.error("Error selecting delivery address:", error);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

const checkWalletBalance = async (userId) => {
  try {
    const user = await User.findById(userId).select("+walletBalance");
    if (!user) {
      return { success: false, message: "User not found", balance: 0 };
    }

    const wallet = await Wallet.findOne({ userId });
    const balance = wallet ? wallet.amount : user.walletBalance || 0;

    return {
      success: true,
      balance: balance,
      hasWallet: true,
    };
  } catch (error) {
    console.error("Error checking wallet balance:", error);
    return {
      success: false,
      message: "Failed to retrieve wallet balance",
      balance: 0,
    };
  }
};

const loadCheckoutPayment = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!req.session.checkout?.addressId) {
      req.flash("warning", "Please select a delivery address first");
      return res.redirect("/checkOut");
    }

    const userCart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "name images variants isActive categoryId",
    });

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

    const cartItems = userCart.items.map((item) => {
      if (!item.productId || typeof item.productId !== "object") {
        console.log("Warning: Product not properly populated for item:", item);
        return {
          id: item.productId || "unknown",
          name: "Product Unavailable",
          size: item.size || "N/A",
          quantity: item.quantity || 1,
          price: 0,
          image: null,
          productId: { name: "Product Unavailable", images: [] },
        };
      }

      const variants = item.productId.variants || [];
      const variant = variants.find((v) => v && v.size === item.size);
      const price = variant ? variant.salePrice : 0;

      return {
        id: item.productId._id,
        name: item.productId.name || "Unnamed Product",
        size: item.size || "N/A",
        quantity: item.quantity || 1,
        price: price,
        image:
          item.productId.images && item.productId.images.length > 0
            ? item.productId.images[0].url
            : null,
        productId: item.productId,
      };
    });

    const totalPrice = cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
    const deliveryCharge = totalPrice > 8000 ? 0 : 200;

    let discountResult = {
      cartItems: cartItems.map((item) => ({
        ...item,
        originalPrice: item.price,
        discountPerUnit: 0,
        discountAmount: 0,
        finalPrice: item.price,
      })),
      cartTotal: totalPrice,
      totalDiscount: 0,
      finalTotal: totalPrice,
      discountApplied: false,
    };

    if (req.session.checkout?.coupon) {
      const storedCoupon = req.session.checkout.coupon;

      const coupon = await Coupon.findById(storedCoupon.couponId);
      if (
        !coupon ||
        !coupon.isActive ||
        new Date() > new Date(coupon.expiryDate)
      ) {
        console.log("Coupon is no longer valid, removing from session");
        delete req.session.checkout.coupon;
        req.session.save();
      } else if (storedCoupon.items && storedCoupon.items.length > 0) {
        discountResult.cartItems = cartItems.map((item) => {
          const itemDiscount = storedCoupon.items.find(
            (i) => i.id && item.id && i.id.toString() === item.id.toString()
          );

          if (itemDiscount) {
            return {
              ...item,
              originalPrice: itemDiscount.originalPrice,
              discountPerUnit: itemDiscount.discountPerUnit,
              discountAmount: itemDiscount.discountAmount,
              finalPrice: itemDiscount.finalPrice,
            };
          }

          return {
            ...item,
            originalPrice: item.price,
            discountPerUnit: 0,
            discountAmount: 0,
            finalPrice: item.price,
          };
        });

        discountResult.totalDiscount = storedCoupon.discount;
        discountResult.finalTotal = totalPrice - storedCoupon.discount;
        discountResult.discountApplied = true;
      }
    }

    const grandTotal = discountResult.finalTotal + deliveryCharge;

    req.session.checkout = req.session.checkout || {};
    req.session.checkout.totalPrice = totalPrice;
    req.session.checkout.grandTotal = grandTotal;
    req.session.checkout.deliveryCharge = deliveryCharge;
    req.session.checkout.discount = discountResult.totalDiscount;

    req.session.save((err) => {
      if (err) {
        console.error("Error saving checkout session:", err);
      }
    });

    const deliveryAddress = await Address.findOne({
      _id: req.session.checkout.addressId,
      userId,
    });

    if (!deliveryAddress) {
      req.flash("warning", "Please select a delivery address.");
      return res.redirect("/checkOut");
    }

    let walletBalance = 0;
    const wallet = await Wallet.findOne({ userId });
    if (wallet) {
      walletBalance = wallet.amount;
    }

    res.render("checkoutPayment", {
      cartItems: discountResult.cartItems,
      totalPrice,
      deliveryCharge,
      discount: discountResult.totalDiscount,
      grandTotal,
      user: req.user,
      appliedCoupon: req.session.checkout?.coupon || null,
      deliveryAddress,
      walletBalance,
      hasWalletBalance: walletBalance >= grandTotal,
      showWalletOption: true,
    });
  } catch (error) {
    console.error("Error loading checkout payment page:", error);
    res.status(500).render("error", {
      message: "Failed to load payment page. Please try again later.",
    });
  }
};

const validatePaymentMethod = async (req, res) => {
  try {
    const { paymentMethod } = req.body;
    const userId = req.user._id;

    if (!["COD", "Wallet", "Online"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    if (paymentMethod === "Wallet") {
      const grandTotal = req.session.checkout?.grandTotal || 0;

      const wallet = await Wallet.findOne({ userId });

      if (!wallet) {
        return res.status(400).json({
          success: false,
          message: "Wallet not found",
        });
      }

      const walletAmount = parseFloat(parseFloat(wallet.amount).toFixed(2));
      const grandTotalAmount = parseFloat(parseFloat(grandTotal).toFixed(2));

      if (walletAmount < grandTotalAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Available: ₹${walletAmount.toFixed(
            2
          )}, Required: ₹${grandTotalAmount.toFixed(2)}`,
          currentBalance: walletAmount,
          required: grandTotalAmount,
        });
      }
    }

    if (paymentMethod === "COD") {
      const grandTotal = req.session.checkout?.grandTotal || 0;
      if (grandTotal > 1000) {
        return res.status(400).json({
          success: false,
          message:
            "COD is not allowed for orders above ₹1000. Please choose another payment method.",
        });
      }
    }

    req.session.checkout = req.session.checkout || {};
    req.session.checkout.paymentMethod = paymentMethod;

    req.session.save((err) => {
      if (err) {
        console.error("Error saving payment method to session:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to save payment method",
        });
      }

      return res.status(200).json({
        success: true,
        message: `${paymentMethod} payment method selected`,
        redirect: "/confirm-order",
      });
    });
  } catch (error) {
    console.error("Error validating payment method:", error);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

const loadOrderConfirmation = async (req, res) => {
  try {
    const userId = req.user._id;

    if (
      !req.session.checkout?.addressId ||
      !req.session.checkout?.paymentMethod
    ) {
      req.flash("warning", "Please complete your checkout process");
      return res.redirect("/checkout");
    }

    const userCart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "name images variants",
    });

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

    const cartItems = userCart.items.map((item) => {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      return {
        id: item.productId._id,
        name: item.productId.name,
        size: item.size,
        quantity: item.quantity,
        price: variant ? variant.salePrice : 0,
        image:
          item.productId.images && item.productId.images.length > 0
            ? item.productId.images[0].url
            : null,
      };
    });

    const totalPrice = cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
    const deliveryCharge = totalPrice > 8000 ? 0 : 200;

    let discountResult = {
      cartItems: cartItems.map((item) => ({
        ...item,
        originalPrice: item.price,
        discountPerUnit: 0,
        discountAmount: 0,
        finalPrice: item.price,
      })),
      cartTotal: totalPrice,
      totalDiscount: 0,
      finalTotal: totalPrice,
      discountApplied: false,
    };

    if (req.session.checkout?.coupon) {
      const storedCoupon = req.session.checkout.coupon;

      const coupon = await Coupon.findById(storedCoupon.couponId);
      if (
        !coupon ||
        !coupon.isActive ||
        new Date() > new Date(coupon.expiryDate)
      ) {
        console.log("Coupon is no longer valid, removing from session");
        delete req.session.checkout.coupon;
        req.session.save();
      } else if (storedCoupon.items && storedCoupon.items.length > 0) {
        discountResult.cartItems = cartItems.map((item) => {
          const itemDiscount = storedCoupon.items.find(
            (i) => i.id && item.id && i.id.toString() === item.id.toString()
          );

          if (itemDiscount) {
            return {
              ...item,
              originalPrice: itemDiscount.originalPrice,
              discountPerUnit: itemDiscount.discountPerUnit,
              discountAmount: itemDiscount.discountAmount,
              finalPrice: itemDiscount.finalPrice,
            };
          }

          return {
            ...item,
            originalPrice: item.price,
            discountPerUnit: 0,
            discountAmount: 0,
            finalPrice: item.price,
          };
        });

        discountResult.totalDiscount = storedCoupon.discount;
        discountResult.finalTotal = totalPrice - storedCoupon.discount;
        discountResult.discountApplied = true;
      }
    }

    const grandTotal = discountResult.finalTotal + deliveryCharge;

    const paymentMethod = req.session.checkout.paymentMethod;

    let walletInfo = null;
    if (paymentMethod === "Wallet") {
      walletInfo = await checkWalletBalance(userId);

      if (!walletInfo.success || walletInfo.balance < grandTotal) {
        req.flash(
          "warning",
          "Insufficient wallet balance. Please choose another payment method."
        );
        return res.redirect("/checkout-payment");
      }
    }

    res.render("orderConfirmation", {
      cartItems: discountResult.cartItems,
      totalPrice,
      discount: discountResult.totalDiscount,
      deliveryCharge,
      grandTotal,
      deliveryAddress,
      paymentMethod,
      walletInfo: paymentMethod === "Wallet" ? walletInfo : null,
      appliedCoupon: req.session.checkout?.coupon || null,
      user: req.user,
    });
  } catch (error) {
    console.error("Error loading order confirmation:", error);
    res.status(500).render("error", {
      message: "Failed to load order confirmation. Please try again later.",
    });
  }
};

module.exports = {
  loadcheckOut,
  selectDeliveryAddress,
  loadCheckoutPayment,
  validatePaymentMethod,
  loadOrderConfirmation,
  checkWalletBalance,
};
