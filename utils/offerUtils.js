/**
 * Utility functions for handling product and category offers
 */

/**
 * Calculate the effective discount by comparing product and category offers
 * @param {number} productOffer - The product offer percentage
 * @param {number} categoryOffer - The category offer percentage
 * @returns {Object} The effective discount and its source
 */
const calculateEffectiveDiscount = (productOffer, categoryOffer) => {
    const productOfferValue = Number(productOffer) || 0
    const categoryOfferValue = Number(categoryOffer) || 0
  
    if (categoryOfferValue > productOfferValue) {
      return {
        discount: categoryOfferValue,
        source: "category",
      }
    } else {
      return {
        discount: productOfferValue,
        source: "product",
      }
    }
  }
  
  /**
   * Calculate the sale price after applying a discount
   * @param {number} originalPrice - The original price
   * @param {number} discountPercentage - The discount percentage
   * @param {number} maxRedeemable - Maximum redeemable amount (optional)
   * @returns {number} The sale price after discount
   */
  const calculateSalePrice = (originalPrice, discountPercentage, maxRedeemable = Number.POSITIVE_INFINITY) => {
    const discountAmount = (originalPrice * discountPercentage) / 100
    const cappedDiscount = maxRedeemable ? Math.min(discountAmount, maxRedeemable) : discountAmount
    return Math.max(Math.round(originalPrice - cappedDiscount), 0)
  }
  
  /**
   * Apply discount to a product variant
   * @param {Object} variant - The product variant
   * @param {number} discountPercentage - The discount percentage
   * @param {number} maxRedeemable - Maximum redeemable amount (optional)
   * @returns {Object} The updated variant with sale price
   */
  const applyDiscountToVariant = (variant, discountPercentage, maxRedeemable = Number.POSITIVE_INFINITY) => {
    const originalPrice = variant.varientPrice
    const salePrice = calculateSalePrice(originalPrice, discountPercentage, maxRedeemable)
  
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
  