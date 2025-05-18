/**
 * Calculates proportional discount for each product in the cart
 * 
 * @param {Array} cartItems - Array of cart items with id, name, size, quantity, price properties
 * @param {Number} couponPercent - Percentage discount to apply
 * @param {Number} minimumPurchase - Minimum cart total required to apply coupon
 * @param {Number} maxRedeemable - Maximum total discount allowed (0 means unlimited)
 * @returns {Object} Discount calculation result with cartItems, cartTotal, totalDiscount, finalTotal, etc.
 */
const calculateProportionalDiscount = (
  cartItems,
  couponPercent,
  minimumPurchase,
  maxRedeemable = 0
) => {
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

  if (typeof couponPercent !== "number" || couponPercent <= 0) {
    return {
      cartItems: cartItems.map((item) => ({
        ...item,
        originalPrice: item.price,
        discountPerUnit: 0,
        discountAmount: 0,
        finalPrice: item.price,
        finalTotal: item.price * item.quantity,
      })),
      cartTotal: cartItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      totalDiscount: 0,
      finalTotal: cartItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      discountApplied: false,
      message: "Invalid discount percentage",
    };
  }

  // Calculate cart total
  const cartTotal = cartItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  // Check if cart meets minimum purchase requirement
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
      message: `Cart total must be at least ₹${minimumPurchase.toFixed(
        2
      )} to apply this coupon.`,
    };
  }

  // Apply discount to each item individually
  const discountedItems = cartItems.map((item) => {
    const itemPrice = item.price;

    // Calculate per-unit discount
    const discountPerUnit = (itemPrice * couponPercent) / 100;
    const discountedPrice = Math.max(0, itemPrice - discountPerUnit);
    const discountAmount = discountPerUnit * item.quantity;
    const finalTotal = discountedPrice * item.quantity;

    return {
      ...item,
      originalPrice: item.price,
      discountPerUnit: Number.parseFloat(discountPerUnit.toFixed(2)),
      discountAmount: Number.parseFloat(discountAmount.toFixed(2)),
      finalPrice: Number.parseFloat(discountedPrice.toFixed(2)),
      finalTotal: Number.parseFloat(finalTotal.toFixed(2)),
    };
  });

  // Calculate total discount across all items
  let totalDiscount = discountedItems.reduce(
    (total, item) => total + item.discountAmount,
    0
  );

  // If max redemption limit is set and exceeded, scale down discounts proportionally
  if (maxRedeemable > 0 && totalDiscount > maxRedeemable) {
    const scaleFactor = maxRedeemable / totalDiscount;

    // Adjust each item's discount proportionally
    for (let i = 0; i < discountedItems.length; i++) {
      const item = discountedItems[i];
      const adjustedDiscountPerUnit = item.discountPerUnit * scaleFactor;
      const adjustedDiscountAmount = item.discountAmount * scaleFactor;
      const adjustedFinalPrice = item.originalPrice - adjustedDiscountPerUnit;
      const adjustedFinalTotal = adjustedFinalPrice * item.quantity;

      discountedItems[i] = {
        ...item,
        discountPerUnit: Number.parseFloat(adjustedDiscountPerUnit.toFixed(2)),
        discountAmount: Number.parseFloat(adjustedDiscountAmount.toFixed(2)),
        finalPrice: Number.parseFloat(adjustedFinalPrice.toFixed(2)),
        finalTotal: Number.parseFloat(adjustedFinalTotal.toFixed(2)),
      };
    }

    // Set total discount to maximum allowed
    totalDiscount = maxRedeemable;
  }

  // Calculate final total after discounts
  const finalTotal = discountedItems.reduce(
    (total, item) => total + item.finalTotal,
    0
  );

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