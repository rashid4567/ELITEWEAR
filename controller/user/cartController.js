const mongoose = require("mongoose");
const User = require("../../model/userSchema");
const Product = require("../../model/productScheema");
const Cart = require("../../model/cartScheema");
const Wishlist = require("../../model/whislistScheema");

const loadCart = async (req, res) => {
  try {
    const user = req.user || req.session.user;
    const userId = user?._id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to view your cart" });
    }

    let userCart = await Cart.findOne({ userId })
      .populate({
        path: "items.productId",
        select: "name images variants.salePrice variants.size variants.varientquatity salePrice isActive",
      })
      .lean();

    if (!userCart || userCart.items.length === 0) {
      return res.render("cart", { cart: null, subtotal: "0.00", message: "Your cart is empty" });
    }

    const removedItems = [];
    const initialItemsLength = userCart.items.length;
    userCart.items = userCart.items.filter((item) => {
      if (!item.productId || !item.productId.isActive) {
        if (item.productId) removedItems.push(item.productId.name || "Unnamed Product");
        return false;
      }
      return true;
    });

    if (userCart.items.length !== initialItemsLength) {
      const cartUpdate = await Cart.findOne({ userId });
      cartUpdate.items = userCart.items.map((item) => ({
        productId: item.productId._id,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
      }));
      await cartUpdate.save();
    }

    let message = null;
    if (removedItems.length > 0) {
      message = `The following items were removed from your cart because they are no longer available: ${removedItems.join(", ")}.`;
    }

    if (userCart.items.length === 0) {
      return res.render("cart", {
        cart: null,
        subtotal: "0.00",
        message: message || "Your cart is empty",
      });
    }

    const subtotal = userCart.items.reduce((total, item) => {
      const variant = item.productId?.variants && item.size
        ? item.productId.variants.find((v) => v.size === item.size)
        : item.productId?.variants && item.productId.variants[0] || { salePrice: item.productId?.salePrice || 0 };
      const price = variant.salePrice || item.productId?.salePrice || 0;
      return total + price * item.quantity;
    }, 0);

    res.render("cart", {
      cart: userCart,
      items: userCart.items,
      subtotal: subtotal.toFixed(2),
      message,
    });
  } catch (error) {
    console.error("loadCart - Error:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const addToCart = async (req, res) => {
  try {
    const user = req.user || req.session.user;
    const userId = user?._id;
    const { productId, quantity = 1, size, color } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to add items to cart",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    const product = await Product.findById(productId).select(
      "name variants color stock salePrice isActive"
    );
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    if (!product.isActive) {
      return res
        .status(400)
        .json({ success: false, message: "This product is no longer available" });
    }

    if (product.stock <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Product is out of stock" });
    }

    let selectedVariant = null;
    if (size && product.variants?.length > 0) {
      selectedVariant = product.variants.find((variant) => variant.size === size);
      if (!selectedVariant) {
        return res
          .status(400)
          .json({ success: false, message: "Selected size not available" });
      }
      if (selectedVariant.varientquatity < parsedQuantity) {
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
        items: [{ productId, quantity: parsedQuantity, size: size || null, color: color || null }],
      });
    } else {
      const itemIndex = userCart.items.findIndex(
        (item) =>
          item.productId.toString() === productId &&
          item.size === (size || null) &&
          item.color === (color || null)
      );

      if (itemIndex > -1) {
        userCart.items[itemIndex].quantity += parsedQuantity;
        if (
          selectedVariant &&
          userCart.items[itemIndex].quantity > selectedVariant.varientquatity
        ) {
          return res.status(400).json({
            success: false,
            message: `Only ${selectedVariant.varientquatity} items available for this size`,
          });
        }
      } else {
        userCart.items.push({
          productId,
          quantity: parsedQuantity,
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
    const user = req.user || req.session.user;
    const userId = user?._id;
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

    const parsedChange = parseInt(change);
    if (isNaN(parsedChange) || ![1, -1].includes(parsedChange)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid quantity change" });
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

    const product = await Product.findById(productId).select("variants stock salePrice isActive");
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    if (!product.isActive) {
      userCart.items.splice(itemIndex, 1);
      await userCart.save();
      return res
        .status(400)
        .json({ success: false, message: "Product is no longer available" });
    }

    const newQuantity = userCart.items[itemIndex].quantity + parsedChange;

    if (size && product.variants?.length > 0) {
      const variant = product.variants.find((v) => v.size === size);
      if (variant && newQuantity > variant.varientquatity) {
        return res.status(400).json({
          success: false,
          message: `Only ${variant.varientquatity} items available for this size`,
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
    const user = req.user || req.session.user;
    const userId = user?._id;
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
    const user = req.user || req.session.user;
    const userId = user?._id;

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

const addToCartAndRemoveFromWishlist = async (req, res) => {
  try {
    const user = req.user || req.session.user;
    const userId = user?._id;
    const { productId, quantity = 1, size, color } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to add items to cart",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    const product = await Product.findById(productId).select(
      "name variants color stock salePrice isActive"
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    if (!product.isActive) {
      return res
        .status(400)
        .json({ success: false, message: "This product is no longer available" });
    }

    if (product.stock <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Product is out of stock" });
    }

    let selectedVariant = null;
    if (size && product.variants?.length > 0) {
      selectedVariant = product.variants.find((variant) => variant.size === size);
      if (!selectedVariant) {
        return res
          .status(400)
          .json({ success: false, message: "Selected size not available" });
      }
      if (selectedVariant.varientquatity < parsedQuantity) {
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
        items: [{ productId, quantity: parsedQuantity, size: size || null, color: color || null }],
      });
    } else {
      const itemIndex = userCart.items.findIndex(
        (item) =>
          item.productId.toString() === productId &&
          item.size === (size || null) &&
          item.color === (color || null)
      );

      if (itemIndex > -1) {
        userCart.items[itemIndex].quantity += parsedQuantity;
        if (
          selectedVariant &&
          userCart.items[itemIndex].quantity > selectedVariant.varientquatity
        ) {
          return res.status(400).json({
            success: false,
            message: `Only ${selectedVariant.varientquatity} items available for this size`,
          });
        }
      } else {
        userCart.items.push({
          productId,
          quantity: parsedQuantity,
          size: size || null,
          color: color || null,
        });
      }
    }

    const wishlist = await Wishlist.findOne({ user: userId });
    if (wishlist && wishlist.products.includes(productId)) {
      wishlist.products = wishlist.products.filter((id) => id.toString() !== productId);
      await wishlist.save();
    }

    await userCart.save();
    return res.status(200).json({
      success: true,
      message: "Product added to cart and removed from wishlist",
    });
  } catch (error) {
    console.error("addToCartAndRemoveFromWishlist - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Server error, please try again" });
  }
};

const blockProduct = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    product.isActive = false; // Block the product
    await product.save();

    await Cart.updateMany(
      { "items.productId": productId },
      { $pull: { items: { productId: productId } } }
    );

    return res
      .status(200)
      .json({ success: true, message: "Product blocked successfully" });
  } catch (error) {
    console.error("blockProduct - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

module.exports = {
  loadCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  emptyCart,
  addToCartAndRemoveFromWishlist,
  blockProduct,
};