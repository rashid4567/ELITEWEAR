const calculateProportionalDiscount = (
  cartItems,
  couponPercent,
  minimumPurchase,
  maxRedeemable = 0
) => {
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
      message: `Cart total must be at least ₹${minimumPurchase.toFixed(
        2
      )} to apply this coupon.`,
    };
  }

  const discountedItems = cartItems.map((item) => {
    const itemPrice = item.price;

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

  let totalDiscount = discountedItems.reduce(
    (total, item) => total + item.discountAmount,
    0
  );

  if (maxRedeemable > 0 && totalDiscount > maxRedeemable) {
    const scaleFactor = maxRedeemable / totalDiscount;

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

    totalDiscount = maxRedeemable;
  }

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
