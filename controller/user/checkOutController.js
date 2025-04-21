const cart = require("../../model/cartScheema");
const product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const address = require("../../model/AddressScheema");
const Category = require("../../model/categoryScheema");

const loadcheckOut = async (req, res) => {
  try {
    const userId = req.user._id;

    const userCart = await cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const validItems = [];
    for (const item of userCart.items) {
      const product = item.productId;
      if (!product || !product.isActive) {
        continue;
      }

      const category = await Category.findById(product.categoryId);
      if (!category || !category.isListed) {
        continue;
      }

      validItems.push(item);
    }

    userCart.items = validItems;
    await userCart.save();

    if (!userCart.items.length) {
      req.flash(
        "warning",
        "Some items were removed from your cart. Please shop again."
      );
      return res.redirect("/");
    }

    const userAddresses = await address.find({ userId });

    const cartItems = userCart.items;
    const totalPrice = cartItems.reduce((total, item) => {
      const productPrice = item.productId.variants?.[0]?.salePrice || 0;
      return total + productPrice * item.quantity;
    }, 0);

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const grandTotal = totalPrice + deliveryCharge;

    res.render("checkOutpage", {
      cartItems,
      totalPrice,
      deliveryCharge,
      grandTotal,
      addresses: userAddresses,
      orderNumber: `2406`,
      user: req.user,
    });
  } catch (error) {
    console.error("Unable to load the checkout page:", error);
    res.status(500).json({ success: false, message: "Server issue" });
  }
};

const selectDeliveryAddress = async (req, res) => {
  try {
    const { addressId } = req.body;
    const userId = req.user._id; // Guaranteed by UserAuth middleware

    const selectedAddress = await address.findOne({ _id: addressId, userId });
    if (!selectedAddress) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address" });
    }

    req.session.checkout = { addressId };

    return res.status(200).json({ success: true, message: "Address selected" });
  } catch (error) {
    console.error("Error selecting delivery address:", error);
    return res.status(500).json({ success: false, message: "Server issue" });
  }
};

const loadCheckoutPayment = async (req, res) => {
  try {
    const userId = req.user._id; // Guaranteed by UserAuth middleware

    const userCart = await cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      req.flash("warning", "Your cart is empty. Please shop again.");
      return res.redirect("/");
    }

    const validItems = [];
    for (const item of userCart.items) {
      const product = item.productId;
      if (!product || !product.isActive) {
        continue;
      }

      const category = await Category.findById(product.categoryId);
      if (!category || !category.isListed) {
        continue;
      }

      validItems.push(item);
    }

    userCart.items = validItems;
    await userCart.save();

    if (!userCart.items.length) {
      req.flash(
        "warning",
        "Some items were removed from your cart. Please shop again."
      );
      return res.redirect("/");
    }

    const cartItems = userCart.items;
    const totalPrice = cartItems.reduce((total, item) => {
      const productPrice = item.productId.variants?.[0]?.salePrice || 0;
      return total + productPrice * item.quantity;
    }, 0);

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const grandTotal = totalPrice + deliveryCharge;

    res.render("checkoutPayment", {
      cartItems,
      totalPrice,
      deliveryCharge,
      grandTotal,
      user: req.user,
    });
  } catch (error) {
    console.error("Error loading checkout payment page:", error);
    res.status(500).send("Server issue");
  }
};

module.exports = {
  loadcheckOut,
  selectDeliveryAddress,
  loadCheckoutPayment,
};