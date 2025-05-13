
const calculateProportionalDiscount = (cartItems, couponPercent, minimumPurchase, maxRedeemable = 0) => {

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

  
    const cartTotal = cartItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
    );

   
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

   
    let totalDiscount = (cartTotal * couponPercent) / 100;
    

    if (maxRedeemable > 0 && totalDiscount > maxRedeemable) {
        totalDiscount = maxRedeemable;
    }


    const discountedItems = cartItems.map((item) => {
        const itemTotal = item.price * item.quantity;
    
        const proportionalDiscount = totalDiscount * (itemTotal / cartTotal);
        const discountPerUnit = proportionalDiscount / item.quantity;
        const finalPrice = Math.max(0, item.price - discountPerUnit); 
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