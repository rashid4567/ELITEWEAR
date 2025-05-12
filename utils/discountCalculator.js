const calculateProportionalDiscount = (cartItems, discountPercentage, minimumPurchase = 0) => {
  // Calculate cart total
  const cartTotal = cartItems.reduce((total, item) => {
    return total + item.price * item.quantity
  }, 0)

  // Check if cart meets minimum purchase requirement
  if (cartTotal < minimumPurchase) {
    return {
      cartItems,
      cartTotal,
      totalDiscount: 0,
      finalTotal: cartTotal,
      discountApplied: false,
      message: `Minimum purchase of ₹${minimumPurchase} required for this coupon`,
    }
  }

  // Calculate total discount amount
  const totalDiscountAmount = (cartTotal * discountPercentage) / 100

  // Calculate proportional discount for each item
  const updatedCartItems = cartItems.map((item) => {
    const itemTotal = item.price * item.quantity
    const itemProportion = itemTotal / cartTotal
    const itemDiscountAmount = totalDiscountAmount * itemProportion
    const itemDiscountPerUnit = itemDiscountAmount / item.quantity

    return {
      ...item,
      originalPrice: item.price,
      discountPerUnit: Number.parseFloat(itemDiscountPerUnit.toFixed(2)),
      discountAmount: Number.parseFloat(itemDiscountAmount.toFixed(2)),
      finalPrice: Number.parseFloat((item.price - itemDiscountPerUnit).toFixed(2)),
    }
  })

  // Calculate final total
  const finalTotal = Number.parseFloat((cartTotal - totalDiscountAmount).toFixed(2))

  return {
    cartItems: updatedCartItems,
    cartTotal,
    totalDiscount: Number.parseFloat(totalDiscountAmount.toFixed(2)),
    finalTotal,
    discountApplied: true,
    message: "Discount applied successfully",
  }
}

module.exports  = {
    calculateProportionalDiscount
}