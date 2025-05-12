/**
 * Calculates proportional discount for cart items based on coupon percentage
 * 
 * @param {Array} cartItems - Array of cart items with id, price, and quantity
 * @param {Number} couponPercent - Discount percentage from coupon
 * @param {Number} minimumPurchase - Minimum purchase amount required for coupon
 * @param {Number} maxRedeemable - Maximum discount amount (optional)
 * @returns {Object} Discount calculation result with updated cart items
 */
const calculateProportionalDiscount = (cartItems, couponPercent, minimumPurchase, maxRedeemable = 0) => {
    // Validate inputs
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        return {
            cartItems: [],
            cartTotal: 0,
            totalDiscount: 0,
            finalTotal: 0,
            discountApplied: false,
            message: "Cart is empty",
        };
    }

    if (typeof couponPercent !== 'number' || couponPercent <= 0) {
        return {
            cartItems: cartItems.map((item) => ({
                ...item,
                originalPrice: item.price,
                discountPerUnit: 0,
                discountAmount: 0,
                finalPrice: item.price,
                finalTotal: item.price * item.quantity,
            })),
            cartTotal: cartItems.reduce((total, item) => total + item.price * item.quantity, 0),
            totalDiscount: 0,
            finalTotal: cartItems.reduce((total, item) => total + item.price * item.quantity, 0),
            discountApplied: false,
            message: "Invalid discount percentage",
        };
    }

    // Calculate total cart value
    const cartTotal = cartItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
    );

    // Check minimum purchase requirement
    if (cartTotal < minimumPurchase) {
        return {
            cartItems: cartItems.map((item) => ({
                ...item,
                originalPrice: item.price,
                discountPerUnit: 0,
                discountAmount: 0,
                finalPrice: item.price,
                finalTotal: item.price * item.quantity,
            })),
            cartTotal,
            totalDiscount: 0,
            finalTotal: cartTotal,
            discountApplied: false,
            message: `Cart total must be at least ₹${minimumPurchase.toFixed(2)} to apply this coupon.`,
        };
    }

    // Calculate total discount based on coupon percentage
    let totalDiscount = (cartTotal * couponPercent) / 100;
    
    // Apply maximum redeemable limit if specified
    if (maxRedeemable > 0 && totalDiscount > maxRedeemable) {
        totalDiscount = maxRedeemable;
    }

    // Distribute discount proportionally to each item
    const discountedItems = cartItems.map((item) => {
        const itemTotal = item.price * item.quantity;
        // Proportional discount for this item
        const proportionalDiscount = totalDiscount * (itemTotal / cartTotal);
        const discountPerUnit = proportionalDiscount / item.quantity;
        const finalPrice = Math.max(0, item.price - discountPerUnit); // Ensure price doesn't go negative
        const finalTotal = finalPrice * item.quantity;

        return {
            ...item,
            originalPrice: item.price,
            discountPerUnit: Number.parseFloat(discountPerUnit.toFixed(2)),
            discountAmount: Number.parseFloat(proportionalDiscount.toFixed(2)),
            finalPrice: Number.parseFloat(finalPrice.toFixed(2)),
            finalTotal: Number.parseFloat(finalTotal.toFixed(2)),
        };
    });

    const finalTotal = cartTotal - totalDiscount;

    return {
        cartItems: discountedItems,
        cartTotal: Number.parseFloat(cartTotal.toFixed(2)),
        totalDiscount: Number.parseFloat(totalDiscount.toFixed(2)),
        finalTotal: Number.parseFloat(finalTotal.toFixed(2)),
        discountApplied: true,
        message: "Coupon applied successfully",
    };
};

module.exports = { calculateProportionalDiscount };