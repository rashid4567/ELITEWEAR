const Coupon = require("../../model/couponScheema");
const Cart = require("../../model/cartScheema");
const mongoose = require("mongoose");

const allCoupons = async (req, res) => {
    try {
      const today = new Date();
      const userId = req.user._id.toString();
  
      
      const page = parseInt(req.query.page) || 1;
      const limit = 5;
      const skip = (page - 1) * limit;
  
      const coupons = await Coupon.find({})
        .sort({ createdAt: 1 }) 
        .limit(10) 
        .lean();
  
      const totalPrice = req.session.checkout?.totalPrice || 0;
  

      const couponsWithStatus = coupons.map((coupon) => {
        const usedBy = coupon.usedBy || [];
        const userUsage = usedBy.find(
          (u) => u && u.userId && u.userId.toString() === userId
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
  
     
      const statusPriority = {
        available: 1,
        upcoming: 2,
        inactive: 3,
        used: 4,
        expired: 5,
      };
  
      couponsWithStatus.sort((a, b) => {
        const statusDiff =
          (statusPriority[a.status] || 10) - (statusPriority[b.status] || 10);
        if (statusDiff !== 0) return statusDiff;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
  
     
      const paginatedCoupons = couponsWithStatus.slice(skip, skip + limit);
      const totalPages = Math.ceil(couponsWithStatus.length / limit);
  
      res.render("Usercoupons", {
        coupons: paginatedCoupons,
        user: req.user,
        currentPage: page,
        totalPages: totalPages,
      });
    } catch (error) {
      console.error("Error in loading allCoupons:", error);
      res.status(500).render("error", {
        message: "Failed to load coupons. Please try again later.",
      });
    }
  };
  
  
const getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const today = new Date();
    const coupons = await Coupon.find({}).lean();
    const couponsWithStatus = coupons.map((coupon) => {
      const usedBy = coupon.usedBy || [];
      const userUsage = usedBy.find(
        (u) => u && u.userId && u.userId.toString() === userId
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
        isEligible:
          isActive &&
          !isUsed &&
          coupon.minimumPurchase <= (req.session.checkout?.totalPrice || 0),
        userUsageCount: userUsage ? userUsage.usedCount : 0,
        remainingUses: userUsage
          ? Math.max(0, coupon.limit - userUsage.usedCount)
          : coupon.limit,
      };
    });

    res.status(200).json({ success: true, coupons: couponsWithStatus });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user._id.toString();

    console.log("Applying coupon:", couponCode, "for user:", userId);

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const coupon = await Coupon.findOne({
      coupencode: couponCode.toUpperCase(),
      isActive: true,
      startingDate: { $lte: new Date() },
      expiryDate: { $gte: new Date() },
    });

    if (!coupon) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired coupon" });
    }


    const usedBy = coupon.usedBy || [];
    const userUsage = usedBy.find(
      (u) => u && u.userId && u.userId.toString() === userId
    );

    if (userUsage && userUsage.usedCount >= coupon.limit) {
      return res.status(400).json({
        success: false,
        message: `You've already used this coupon ${userUsage.usedCount} time(s). Maximum usage limit reached.`,
      });
    }

    let totalPrice = 0;
    for (const item of cart.items) {
      const productPrice =
        item.productId.variants.find((v) => v.size === item.size)?.salePrice ||
        0;
      totalPrice += productPrice * item.quantity;
    }

    if (totalPrice < coupon.minimumPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${
          coupon.minimumPurchase
        } required. Add ₹${(coupon.minimumPurchase - totalPrice).toFixed(
          2
        )} more to use this coupon.`,
      });
    }

    let discount = (coupon.couponpercent / 100) * totalPrice;
    if (coupon.maxRedeemable > 0 && discount > coupon.maxRedeemable) {
      discount = coupon.maxRedeemable;
    }

 
    if (!req.session.checkout) {
      req.session.checkout = {};
    }
    req.session.checkout.totalPrice = totalPrice;


    req.session.checkout.coupon = {
      couponId: coupon._id.toString(),
      code: coupon.coupencode,
      discount: Number.parseFloat(discount.toFixed(2)),
    };

    req.session.save((err) => {
      if (err) {
        console.error("Error saving session:", err);
      } else {
        console.log("Session saved successfully");
      }
    });

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const grandTotal = totalPrice - discount + deliveryCharge;

    res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: {
        discount: discount.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        deliveryCharge: deliveryCharge.toFixed(2),
      },
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    let totalPrice = 0;
    for (const item of cart.items) {
      const productPrice =
        item.productId.variants.find((v) => v.size === item.size)?.salePrice ||
        0;
      totalPrice += productPrice * item.quantity;
    }

    if (req.session.checkout && req.session.checkout.coupon) {
      delete req.session.checkout.coupon;
      req.session.save((err) => {
        if (err) {
          console.error("Error saving session after coupon removal:", err);
        } else {
          console.log("Session saved successfully after coupon removal");
        }
      });
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const grandTotal = totalPrice + deliveryCharge;

    res.status(200).json({
      success: true,
      message: "Coupon removed successfully",
      data: {
        discount: "0.00",
        grandTotal: grandTotal.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        deliveryCharge: deliveryCharge.toFixed(2),
      },
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

module.exports = {
  allCoupons,
  getAvailableCoupons,
  applyCoupon,
  removeCoupon,
};