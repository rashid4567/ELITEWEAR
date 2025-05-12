const Coupon = require("../../model/couponScheema");
const Cart = require("../../model/cartScheema");
const mongoose = require("mongoose");
const { calculateProportionalDiscount } = require("../../utils/discountCalculator");

/**
 * Get all coupons for user display
 */
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

/**
 * Get available coupons for API/AJAX requests
 */
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

/**
 * Apply coupon to cart
 */
const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.user._id.toString();

        console.log(`Applying coupon: ${couponCode} for user: ${userId}`);

        // Fetch the user's cart
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            select: "name images variants"
        });
        
        if (!cart || !cart.items.length) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        // Validate the coupon
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

        // Check usage limit
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

        // Prepare cart items for discount calculation
        const cartItems = cart.items.map((item) => {
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

        // Calculate discounts
        const discountResult = calculateProportionalDiscount(
            cartItems,
            coupon.couponpercent,
            coupon.minimumPurchase,
            coupon.maxRedeemable
        );

        if (!discountResult.discountApplied) {
            return res.status(400).json({
                success: false,
                message: discountResult.message,
            });
        }

        // Calculate delivery charge and grand total
        const deliveryCharge = discountResult.cartTotal > 8000 ? 0 : 200;
        const grandTotal = discountResult.finalTotal + deliveryCharge;

        // Store in session
        req.session.checkout = {
            totalPrice: discountResult.cartTotal,
            discount: discountResult.totalDiscount,
            deliveryCharge: deliveryCharge,
            grandTotal: grandTotal,
            discountedItems: discountResult.cartItems,
            coupon: {
                couponId: coupon._id.toString(),
                code: coupon.coupencode,
                discount: discountResult.totalDiscount,
                percent: coupon.couponpercent,
                maxDiscount: coupon.maxRedeemable,
                items: discountResult.cartItems.map((item) => ({
                    id: item.id,
                    originalPrice: item.originalPrice,
                    discountPerUnit: item.discountPerUnit,
                    discountAmount: item.discountAmount,
                    finalPrice: item.finalPrice,
                    finalTotal: item.finalTotal,
                })),
            }
        };

        // Ensure session is saved before responding
        req.session.save((err) => {
            if (err) {
                console.error("Error saving session:", err);
                return res.status(500).json({ 
                    success: false, 
                    message: "Server error: Failed to save coupon data" 
                });
            }

            // Send successful response
            res.status(200).json({
                success: true,
                message: "Coupon applied successfully",
                data: {
                    discount: discountResult.totalDiscount.toFixed(2),
                    grandTotal: grandTotal.toFixed(2),
                    totalPrice: discountResult.cartTotal.toFixed(2),
                    deliveryCharge: deliveryCharge.toFixed(2),
                    items: discountResult.cartItems.map((item) => ({
                        id: item.id,
                        name: item.name,
                        originalPrice: item.originalPrice.toFixed(2),
                        discountPerUnit: item.discountPerUnit.toFixed(2),
                        finalPrice: item.finalPrice.toFixed(2),
                        quantity: item.quantity,
                        totalDiscount: item.discountAmount.toFixed(2),
                        finalTotal: item.finalTotal.toFixed(2),
                    })),
                },
            });
        });
    } catch (error) {
        console.error("Error applying coupon:", error);
        res
            .status(500)
            .json({ success: false, message: "Server error: " + error.message });
    }
};

/**
 * Remove applied coupon
 */
const removeCoupon = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "name variants"
    });
    
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // Calculate total price without discount
    let totalPrice = 0;
    for (const item of cart.items) {
      const productPrice =
        item.productId.variants.find((v) => v.size === item.size)?.salePrice ||
        0;
      totalPrice += productPrice * item.quantity;
    }

    // Remove coupon from session
    if (req.session.checkout && req.session.checkout.coupon) {
      delete req.session.checkout.coupon;
      delete req.session.checkout.discount;
      delete req.session.checkout.discountedItems;
      
      // Update totals
      const deliveryCharge = totalPrice > 8000 ? 0 : 200;
      const grandTotal = totalPrice + deliveryCharge;
      
      req.session.checkout.totalPrice = totalPrice;
      req.session.checkout.deliveryCharge = deliveryCharge;
      req.session.checkout.grandTotal = grandTotal;
      
      // Save session
      req.session.save((err) => {
        if (err) {
          console.error("Error saving session after coupon removal:", err);
          return res.status(500).json({ 
            success: false, 
            message: "Server error: Failed to save session" 
          });
        }
        
        // Send successful response
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
      });
    } else {
      // No coupon was applied
      const deliveryCharge = totalPrice > 8000 ? 0 : 200;
      const grandTotal = totalPrice + deliveryCharge;
      
      res.status(200).json({
        success: true,
        message: "No coupon was applied",
        data: {
          discount: "0.00",
          grandTotal: grandTotal.toFixed(2),
          totalPrice: totalPrice.toFixed(2),
          deliveryCharge: deliveryCharge.toFixed(2),
        },
      });
    }
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