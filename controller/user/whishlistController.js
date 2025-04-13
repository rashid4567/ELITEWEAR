const mongoose = require("mongoose");
const User = require("../../model/userSchema");
const Wishlist = require("../../model/whislistScheema");
const Product = require("../../model/productScheema");

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      console.error("getWishlist - No user ID in session");
      return res.redirect("/login");
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error("getWishlist - User not found:", userId);
      return res.redirect("/page-not-found");
    }

    const wishlist = await Wishlist.findOne({ user: userId }).populate({
      path: "products",
      populate: { path: "categoryId", model: "Category" },
    });

    const products = wishlist ? wishlist.products : [];

    res.render("wishlist", {
      user: user,
      fullname: user.fullname,
      products: products,
    });
  } catch (error) {
    console.error("getWishlist - Error:", error);
    return res.redirect("/page-not-found");
  }
};

const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to add to wishlist" });
    }

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

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = new Wishlist({ user: userId, products: [productId] });
    } else if (wishlist.products.includes(productId)) {
      return res
        .status(200)
        .json({
          success: false,
          message: "Product is already in the wishlist",
        });
    } else {
      wishlist.products.push(productId);
    }

    await wishlist.save();

    return res
      .status(200)
      .json({ success: true, message: "Product added to wishlist" });
  } catch (error) {
    console.error("addToWishlist - Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error, please try again" });
  }
};

const getWishlistIds = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.json({ products: [] });
    }

    const wishlist = await Wishlist.findOne({ user: userId });

    res.json({
      products: wishlist ? wishlist.products.map((id) => id.toString()) : [],
    });
  } catch (error) {
    console.error("getWishlistIds - Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const removeWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Please log in to remove from wishlist",
        });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) {
      return res
        .status(404)
        .json({ success: false, message: "Wishlist not found" });
    }

    const productIndex = wishlist.products.indexOf(productId);
    if (productIndex === -1) {
      return res
        .status(200)
        .json({ success: false, message: "Product not found in wishlist" });
    }

    wishlist.products.splice(productIndex, 1);
    await wishlist.save();

    return res
      .status(200)
      .json({ success: true, message: "Product removed from wishlist" });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Server error, please try again" });
  }
};

const emptyWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to empty wishlist" });
    }

    const wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) {
      return res
        .status(404)
        .json({ success: false, message: "Wishlist not found" });
    }

    wishlist.products = [];
    await wishlist.save();

    return res
      .status(200)
      .json({ success: true, message: "Wishlist cleared successfully" });
  } catch (error) {
    console.error("emptyWishlist - Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error, please try again" });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  getWishlistIds,
  removeWishlist,
  emptyWishlist,
};
