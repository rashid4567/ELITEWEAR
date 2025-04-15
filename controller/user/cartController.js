const mongoose = require("mongoose");
const User = require("../../model/userSchema");
const Product = require("../../model/productScheema");
const Cart = require("../../model/cartScheema");

const loadCart = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to view your cart" });
    }

    const userCart = await Cart.findOne({ userId })
      .populate({
        path: "items.productId",
        select: "name images variants",
      })
      .lean();

    if (!userCart || userCart.items.length === 0) {
      return res.render("cart", { cart: null, message: "Your cart is empty" });
    }

    res.render("cart", {
      cart: userCart,
      items: userCart.items,
    });
  } catch (error) {
    console.error("loadCart - Error:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { productId, quantity = 1, size, color } = req.body;

    if (!userId) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Please log in to add items to cart",
        });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const product = await Product.findById(productId).select(
      "name variants color stock"
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (product.stock <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Product is out of stock" });
    }

    let selectedVariant = null;
    if (size && product.variants?.length > 0) {
      selectedVariant = product.variants.find(
        (variant) => variant.size === size
      );
      if (!selectedVariant) {
        return res
          .status(400)
          .json({ success: false, message: "Selected size not available" });
      }
      if (selectedVariant.variantQuantity < quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${selectedVariant.varientquatity} items available for this size`,
        });
      }
    }

    if (color && product.color && product.color !== color) {
      return res
        .status(400)
        .json({ success: false, message: "Selected color not available" });
    }

    let userCart = await Cart.findOne({ userId });

    if (!userCart) {
      userCart = new Cart({
        userId,
        items: [
          {
            productId,
            quantity: parseInt(quantity),
            size: size || null,
            color: color || null,
          },
        ],
      });
    } else {
      const itemIndex = userCart.items.findIndex(
        (item) =>
          item.productId.toString() === productId &&
          item.size === (size || null) &&
          item.color === (color || null)
      );

      if (itemIndex > -1) {
        userCart.items[itemIndex].quantity += parseInt(quantity);
        if (
          selectedVariant &&
          userCart.items[itemIndex].quantity > selectedVariant.variantQuantity
        ) {
          return res.status(400).json({
            success: false,
            message: `Only ${selectedVariant.varientquatity} items available for this size`,
          });
        }
      } else {
        userCart.items.push({
          productId,
          quantity: parseInt(quantity),
          size: size || null,
          color: color || null,
        });
      }
    }

    await userCart.save();

    return res
      .status(200)
      .json({ success: true, message: "Product added to cart successfully" });
  } catch (error) {
    console.error("addToCart - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Failed to add product to cart" });
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { productId, size, color, change } = req.body;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to update your cart" });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const userCart = await Cart.findOne({ userId });
    if (!userCart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const itemIndex = userCart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        item.size === (size || null) &&
        item.color === (color || null)
    );

    if (itemIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in cart" });
    }

    const product = await Product.findById(productId).select("variants stock");
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const newQuantity = userCart.items[itemIndex].quantity + parseInt(change);

    if (size && product.variants?.length > 0) {
      const variant = product.variants.find((v) => v.size === size);
      if (variant && newQuantity > variant.variantQuantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${variant.variantQuantity} items available for this size`,
        });
      }
    } else if (newQuantity > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} items available`,
      });
    }

    if (newQuantity <= 0) {
      userCart.items.splice(itemIndex, 1);
    } else {
      userCart.items[itemIndex].quantity = newQuantity;
    }

    await userCart.save();

    return res
      .status(200)
      .json({ success: true, message: "Cart updated successfully" });
  } catch (error) {
    console.error("updateCartQuantity - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update cart" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { productId, size, color } = req.body;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to remove items" });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const userCart = await Cart.findOne({ userId });
    if (!userCart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const initialLength = userCart.items.length;
    userCart.items = userCart.items.filter(
      (item) =>
        !(
          item.productId.toString() === productId &&
          item.size === (size || null) &&
          item.color === (color || null)
        )
    );

    if (userCart.items.length === initialLength) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in cart" });
    }

    await userCart.save();

    return res
      .status(200)
      .json({ success: true, message: "Item removed from cart" });
  } catch (error) {
    console.error("removeFromCart - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Failed to remove item" });
  }
};

const emptyCart = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to clear your cart" });
    }

    const userCart = await Cart.findOne({ userId });
    if (!userCart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    userCart.items = [];
    await userCart.save();

    return res
      .status(200)
      .json({ success: true, message: "Cart cleared successfully" });
  } catch (error) {
    console.error("emptyCart - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Failed to clear cart" });
  }
};


module.exports = {
  loadCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  emptyCart,
  
};
