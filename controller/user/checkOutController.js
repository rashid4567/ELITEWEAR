const Cart = require("../../model/cartScheema")
const Product = require("../../model/productScheema")
const User = require("../../model/userSchema")
const Address = require("../../model/AddressScheema")
const Category = require("../../model/categoryScheema")
const Coupon = require("../../model/couponScheema")

const loadcheckOut = async (req, res) => {
  try {
    const userId = req.user._id

    const userCart = await Cart.findOne({ userId }).populate("items.productId")
    if (!userCart || !userCart.items.length) {
      delete req.session.checkout
      return res.status(400).json({ success: false, message: "Cart is empty" })
    }

    const validItems = []
    for (const item of userCart.items) {
      const product = item.productId
      if (!product || !product.isActive) continue

      const category = await Category.findById(product.categoryId)
      if (!category || !category.isListed) continue

      validItems.push(item)
    }

    userCart.items = validItems
    await userCart.save()

    if (!userCart.items.length) {
      delete req.session.checkout
      req.flash("warning", "Some items were removed from your cart. Please shop again.")
      return res.redirect("/")
    }

    const userAddresses = await Address.find({ userId })

    const cartItems = userCart.items
    let totalPrice = 0
    for (const item of cartItems) {
      const productPrice = item.productId.variants.find((v) => v.size === item.size)?.salePrice || 0
      totalPrice += productPrice * item.quantity
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200
    const discount = req.session.checkout?.coupon?.discount || 0
    const grandTotal = totalPrice - discount + deliveryCharge

    // Store totalPrice in session for coupon eligibility checks
    if (!req.session.checkout) {
      req.session.checkout = {}
    }
    req.session.checkout.totalPrice = totalPrice

    // Fetch all coupons and determine their status
    const today = new Date()
    const coupons = await Coupon.find({}).lean()
    const couponsWithStatus = coupons.map((coupon) => {
      // Add a safety check for usedBy
      const usedBy = coupon.usedBy || []
      const userUsage = usedBy.find((u) => u && u.userId && u.userId.toString() === userId.toString())

      const isExpired = new Date(coupon.expiryDate) < today
      const notStarted = new Date(coupon.startingDate) > today
      const isUsed = userUsage && userUsage.usedCount >= coupon.limit
      const isActive = coupon.isActive && !isExpired && new Date(coupon.startingDate) <= today

      return {
        ...coupon,
        status: isUsed ? "used" : isExpired ? "expired" : notStarted ? "upcoming" : isActive ? "available" : "inactive",
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
        remainingUses: userUsage ? Math.max(0, coupon.limit - userUsage.usedCount) : coupon.limit,
      }
    })

    res.render("checkOutpage", {
      cartItems,
      totalPrice,
      deliveryCharge,
      discount,
      grandTotal,
      addresses: userAddresses,
      orderNumber: `2406`,
      user: req.user,
      appliedCoupon: req.session.checkout?.coupon || null,
      coupons: couponsWithStatus,
    })
  } catch (error) {
    console.error("Unable to load the checkout page:", error)
    res.status(500).json({ success: false, message: "Server issue" })
  }
}

const selectDeliveryAddress = async (req, res) => {
  try {
    const { addressId } = req.body
    const userId = req.user._id

    const selectedAddress = await Address.findOne({ _id: addressId, userId })
    if (!selectedAddress) {
      return res.status(400).json({ success: false, message: "Invalid address" })
    }

    req.session.checkout = req.session.checkout || {}
    req.session.checkout.addressId = addressId

    return res.status(200).json({ success: true, message: "Address selected" })
  } catch (error) {
    console.error("Error selecting delivery address:", error)
    return res.status(500).json({ success: false, message: "Server issue" })
  }
}

const loadCheckoutPayment = async (req, res) => {
  try {
    const userId = req.user._id

    const userCart = await Cart.findOne({ userId }).populate("items.productId")
    if (!userCart || !userCart.items.length) {
      req.flash("warning", "Your cart is empty. Please shop again.")
      return res.redirect("/")
    }

    const validItems = []
    for (const item of userCart.items) {
      const product = item.productId
      if (!product || !product.isActive) {
        continue
      }

      const category = await Category.findById(product.categoryId)
      if (!category || !category.isListed) {
        continue
      }

      validItems.push(item)
    }

    userCart.items = validItems
    await userCart.save()

    if (!userCart.items.length) {
      req.flash("warning", "Some items were removed from your cart. Please shop again.")
      return res.redirect("/")
    }

    const cartItems = userCart.items
    let totalPrice = 0
    for (const item of cartItems) {
      const productPrice = item.productId.variants.find((v) => v.size === item.size)?.salePrice || 0
      totalPrice += productPrice * item.quantity
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200
    const discount = req.session.checkout?.coupon?.discount || 0
    const grandTotal = totalPrice - discount + deliveryCharge

    res.render("checkoutPayment", {
      cartItems,
      totalPrice,
      deliveryCharge,
      discount,
      grandTotal,
      user: req.user,
      appliedCoupon: req.session.checkout?.coupon || null,
    })
  } catch (error) {
    console.error("Error loading checkout payment page:", error)
    res.status(500).send("Server issue")
  }
}

module.exports = {
  loadcheckOut,
  selectDeliveryAddress,
  loadCheckoutPayment,
}
