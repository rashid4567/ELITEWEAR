const mongoose = require("mongoose");
const User = require("../../model/userSchema");
const Product = require("../../model/productScheema");
const Cart = require("../../model/cartScheema");
const Wishlist = require("../../model/whislistScheema");
const Category = require("../../model/categoryScheema");
const logger = require("../../utils/logger");
const loadCart = async (req, res) => {
  try {
    let userCart = await Cart.findOne({ userId: req.user._id })
      .populate({
        path: "items.productId",
        select:
          "name images variants.salePrice variants.size variants.varientquatity salePrice isActive categoryId",
      })
      .lean();

    if (!userCart || userCart.items.length === 0) {
      return res.render("cart", {
        cart: null,
        subtotal: "0.00",
        message: "Your cart is empty",
      });
    }

    const productIds = userCart.items
      .map((item) => item.productId?._id)
      .filter((id) => id);
    const products = await Product.find({ _id: { $in: productIds } }).select(
      "categoryId isActive"
    );
    const categoryIds = [...new Set(products.map((p) => p.categoryId))];
    const categories = await Category.find({
      _id: { $in: categoryIds },
    }).select("_id isListed");
    const categoryMap = new Map(
      categories.map((c) => [c._id.toString(), c.isListed])
    );

    const removedItems = [];
    const initialItemsLength = userCart.items.length;
    userCart.items = userCart.items.filter((item) => {
      if (!item.productId || !item.productId.isActive) {
        if (item.productId)
          removedItems.push(item.productId.name || "Unnamed Product");
        return false;
      }

      const categoryId = item.productId.categoryId?.toString();
      if (!categoryId || categoryMap.get(categoryId) === false) {
        if (item.productId)
          removedItems.push(item.productId.name || "Unnamed Product");
        return false;
      }
      return true;
    });

    if (userCart.items.length !== initialItemsLength) {
      const cartUpdate = await Cart.findOne({ userId: req.user._id });
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
      message = `The following items were removed from your cart because they are no longer available or their category is blocked: ${removedItems.join(
        ", "
      )}.`;
    }

    if (userCart.items.length === 0) {
      return res.render("cart", {
        cart: null,
        subtotal: "0.00",
        message: message || "Your cart is empty",
      });
    }

    const subtotal = userCart.items.reduce((total, item) => {
      const variant =
        item.productId?.variants && item.size
          ? item.productId.variants.find((v) => v.size === item.size)
          : (item.productId?.variants && item.productId.variants[0]) || {
              salePrice: item.productId?.salePrice || 0,
            };
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
    logger.error("loadCart - Error:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const addToCart = async (req, res) => {
  try {
    let { productId, quantity = 1, size, color } = req.body;

    size = size === "" || size === undefined ? null : size;
    color = color === "" || color === undefined ? null : color;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid quantity" });
    }

    const product = await Product.findById(productId).select(
      "name variants color stock salePrice isActive categoryId"
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        message: "This product is no longer available",
      });
    }

    const category = await Category.findById(product.categoryId);
    if (!category || !category.isListed) {
      return res.status(400).json({
        success: false,
        message: "This product's category is not available",
      });
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

    let userCart = await Cart.findOne({ userId: req.user._id });
    if (!userCart) {
      userCart = new Cart({
        userId: req.user._id,
        items: [{ productId, quantity: parsedQuantity, size, color }],
      });
    } else {
      const uniqueProductIds = new Set(
        userCart.items.map((item) => item.productId.toString())
      );
      const isNewProduct = !uniqueProductIds.has(productId);

      if (isNewProduct && uniqueProductIds.size >= 10) {
        return res.status(400).json({
          success: false,
          message: "Cart cannot contain more than 10 unique products",
        });
      }

      const totalProductQuantity = userCart.items.reduce((total, item) => {
        return item.productId.toString() === productId
          ? total + item.quantity
          : total;
      }, 0);

      const itemIndex = userCart.items.findIndex(
        (item) =>
          item.productId.toString() === productId &&
          item.size === size &&
          item.color === color
      );

      if (itemIndex > -1) {
        const newQuantity = userCart.items[itemIndex].quantity + parsedQuantity;

        const otherVariantsQuantity =
          totalProductQuantity - userCart.items[itemIndex].quantity;
        if (otherVariantsQuantity + newQuantity > 10) {
          return res.status(400).json({
            success: false,
            message: `You can only have up to 10 items of the same product in your cart`,
          });
        }

        if (selectedVariant && newQuantity > selectedVariant.varientquatity) {
          return res.status(400).json({
            success: false,
            message: `Only ${selectedVariant.varientquatity} items available for this size`,
          });
        }
        if (!selectedVariant && newQuantity > product.stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${product.stock} items available`,
          });
        }
        userCart.items[itemIndex].quantity = newQuantity;
      } else {
        if (totalProductQuantity + parsedQuantity > 10) {
          return res.status(400).json({
            success: false,
            message: `You can only have up to 10 items of the same product in your cart`,
          });
        }

        userCart.items.push({
          productId,
          quantity: parsedQuantity,
          size,
          color,
        });
      }
    }

    let wishlistCount = 0;
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (wishlist && wishlist.products.includes(productId)) {
      wishlist.products = wishlist.products.filter(
        (id) => id.toString() !== productId
      );
      await wishlist.save();
      wishlistCount = wishlist.products.length;
    } else {
      wishlistCount = wishlist ? wishlist.products.length : 0;
    }

    await userCart.save();

    const updatedItem = userCart.items.find(
      (item) =>
        item.productId.toString() === productId &&
        item.size === size &&
        item.color === color
    );

    return res.status(200).json({
      success: true,
      message: "Product added to cart",
      wishlistCount,
      cartItemCount: userCart.items.length,
      updatedItem: updatedItem
        ? {
            productId: updatedItem.productId.toString(),
            quantity: updatedItem.quantity,
            size: updatedItem.size,
            color: updatedItem.color,
          }
        : null,
    });
  } catch (error) {
    logger.error("addToCart - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Failed to add product to cart" });
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    let { productId, size, color, change } = req.body;

    size = size === "" || size === undefined ? null : size;
    color = color === "" || color === undefined ? null : color;

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

    const userCart = await Cart.findOne({ userId: req.user._id });
    if (!userCart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const itemIndex = userCart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        item.size === size &&
        item.color === color
    );

    if (itemIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in cart" });
    }

    const product = await Product.findById(productId).select(
      "variants stock salePrice isActive categoryId"
    );
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

    const category = await Category.findById(product.categoryId);
    if (!category || !category.isListed) {
      userCart.items.splice(itemIndex, 1);
      await userCart.save();
      return res.status(400).json({
        success: false,
        message: "This product's category is not available",
      });
    }

    const newQuantity = userCart.items[itemIndex].quantity + parsedChange;

    if (parsedChange > 0) {
      const totalProductQuantity = userCart.items.reduce((total, item) => {
        return item.productId.toString() === productId
          ? total + (item === userCart.items[itemIndex] ? 0 : item.quantity)
          : total;
      }, 0);

      if (totalProductQuantity + newQuantity > 10) {
        return res.status(400).json({
          success: false,
          message: `You can only have up to 10 items of the same product in your cart`,
        });
      }

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
    logger.error("updateCartQuantity - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update cart" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    let { productId, size, color } = req.body;

    size = size === "" || size === undefined ? null : size;
    color = color === "" || color === undefined ? null : color;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const userCart = await Cart.findOne({ userId: req.user._id });
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
          item.size === size &&
          item.color === color
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
    logger.error("removeFromCart - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Failed to remove item" });
  }
};

const emptyCart = async (req, res) => {
  try {
    const userCart = await Cart.findOne({ userId: req.user._id });
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
    logger.error("emptyCart - Error:", error.message, error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Failed to clear cart" });
  }
};

const addToCartAndRemoveFromWishlist = async (req, res) => {
  try {
    let { productId, quantity = 1, size, color } = req.body;

    size = size === "" || size === undefined ? null : size;
    color = color === "" || color === undefined ? null : color;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid quantity" });
    }

    const product = await Product.findById(productId).select(
      "name variants color stock salePrice isActive categoryId"
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        message: "This product is no longer available",
      });
    }

    const category = await Category.findById(product.categoryId);
    if (!category || !category.isListed) {
      return res.status(400).json({
        success: false,
        message: "This product's category is not available",
      });
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

    let userCart = await Cart.findOne({ userId: req.user._id });
    if (!userCart) {
      userCart = new Cart({
        userId: req.user._id,
        items: [{ productId, quantity: parsedQuantity, size, color }],
      });
    } else {
      const uniqueProductIds = new Set(
        userCart.items.map((item) => item.productId.toString())
      );
      const isNewProduct = !uniqueProductIds.has(productId);

      if (isNewProduct && uniqueProductIds.size >= 10) {
        return res.status(400).json({
          success: false,
          message: "Cart cannot contain more than 10 unique products",
        });
      }

      const itemIndex = userCart.items.findIndex(
        (item) =>
          item.productId.toString() === productId &&
          item.size === size &&
          item.color === color
      );

      if (itemIndex > -1) {
        const newQuantity = userCart.items[itemIndex].quantity + parsedQuantity;
        if (selectedVariant && newQuantity > selectedVariant.varientquatity) {
          return res.status(400).json({
            success: false,
            message: `Only ${selectedVariant.varientquatity} items available for this size`,
          });
        }
        if (!selectedVariant && newQuantity > product.stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${product.stock} items available`,
          });
        }
        userCart.items[itemIndex].quantity = newQuantity;
      } else {
        userCart.items.push({
          productId,
          quantity: parsedQuantity,
          size,
          color,
        });
      }
    }

    let wishlistCount = 0;
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (wishlist && wishlist.products.includes(productId)) {
      wishlist.products = wishlist.products.filter(
        (id) => id.toString() !== productId
      );
      await wishlist.save();
      wishlistCount = wishlist.products.length;
    } else {
      wishlistCount = wishlist ? wishlist.products.length : 0;
    }

    await userCart.save();

    const updatedItem = userCart.items.find(
      (item) =>
        item.productId.toString() === productId &&
        item.size === size &&
        item.color === color
    );

    return res.status(200).json({
      success: true,
      message: "Product added to cart and removed from wishlist",
      wishlistCount,
      cartItemCount: userCart.items.length,
      updatedItem: updatedItem
        ? {
            productId: updatedItem.productId.toString(),
            quantity: updatedItem.quantity,
            size: updatedItem.size,
            color: updatedItem.color,
          }
        : null,
    });
  } catch (error) {
    logger.error(
      "addToCartAndRemoveFromWishlist - Error:",
      error.message,
      error.stack
    );
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

    product.isActive = false;
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
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const blockCategory = async (req, res) => {
  try {
    const { categoryId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid category ID" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    category.isListed = false;
    await category.save();

    const products = await Product.find({ categoryId }).select("_id");
    const productIds = products.map((p) => p._id);

    await Cart.updateMany(
      { "items.productId": { $in: productIds } },
      { $pull: { items: { productId: { $in: productIds } } } }
    );

    return res
      .status(200)
      .json({ success: true, message: "Category blocked successfully" });
  } catch (error) {
    console.error("blockCategory - Error:", error.message, error.stack);
    return res.status(500).json({ success: false, message: "Server error" });
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
  blockCategory,
};
