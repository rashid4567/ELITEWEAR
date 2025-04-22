const Coupon = require("../../model/couponScheema");
const Cart = require("../../model/cartScheema");
const mongoose = require("mongoose");

const getAvailableCoupons = async (req, res) => {
    try {
        const today = new Date();
        const coupons = await Coupon.find({
            isActive: true,
            startingDate: { $lte: today },
            expiryDate: { $gte: today },
        });
        console.log('Fetched coupons from DB:', coupons);
        res.status(200).json({ success: true, coupons });
    } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.user._id.toString();
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
            return res.status(400).json({ success: false, message: "Invalid or expired coupon" });
        }

        const userUsage = coupon.usedBy.find(u => u.userId.toString() === userId);
        if (userUsage && userUsage.usedCount >= coupon.limit) {
            return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
        }

        let totalPrice = 0;
        for (const item of cart.items) {
            const productPrice = item.productId.variants.find(v => v.size === item.size)?.salePrice || 0;
            totalPrice += productPrice * item.quantity;
        }

        if (totalPrice < coupon.minimumPurchase) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minimumPurchase} required`,
            });
        }

        let discount = (coupon.couponpercent / 100) * totalPrice;
        if (coupon.maxRedeemable > 0 && discount > coupon.maxRedeemable) {
            discount = coupon.maxRedeemable;
        }

        req.session.checkout = req.session.checkout || {};
        req.session.checkout.coupon = {
            couponId: coupon._id,
            code: coupon.coupencode,
            discount: discount.toFixed(2),
        };

        const deliveryCharge = totalPrice > 8000 ? 0 : 200;
        const grandTotal = totalPrice - discount + deliveryCharge;

        console.log('Coupon applied:', { couponCode, discount, grandTotal });
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
        res.status(500).json({ success: false, message: "Server error" });
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
            const productPrice = item.productId.variants.find(v => v.size === item.size)?.salePrice || 0;
            totalPrice += productPrice * item.quantity;
        }

        if (req.session.checkout && req.session.checkout.coupon) {
            delete req.session.checkout.coupon;
        }

        const deliveryCharge = totalPrice > 8000 ? 0 : 200;
        const grandTotal = totalPrice + deliveryCharge;

        console.log('Coupon removed:', { totalPrice, grandTotal });
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
        res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = {
    getAvailableCoupons,
    applyCoupon,
    removeCoupon,
};