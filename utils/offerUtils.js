
const calculateEffectiveDiscount = (productOffer, categoryOffer) => {
  if (productOffer >= categoryOffer) {
    return { discount: productOffer, source: "product" }
  } else if (categoryOffer > 0) {
    return { discount: categoryOffer, source: "category" }
  }
  return { discount: 0, source: "none" }
}


const calculateSalePrice = (regularPrice, discountPercentage) => {
  if (!regularPrice || isNaN(regularPrice)) return 0
  if (!discountPercentage || isNaN(discountPercentage)) return regularPrice

  const discountAmount = (regularPrice * discountPercentage) / 100
  return Math.round(regularPrice - discountAmount)
}


const applyDiscountToVariant = (variant, discountPercentage) => {
  if (!variant || !variant.varientPrice) return variant

  const salePrice = calculateSalePrice(variant.varientPrice, discountPercentage)
  return {
    ...variant,
    salePrice: salePrice,
  }
}

module.exports = {
  calculateEffectiveDiscount,
  calculateSalePrice,
  applyDiscountToVariant,
}
