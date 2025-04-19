const cart = require("../../model/cartScheema");
const product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const address = require("../../model/AddressScheema");
const Category = require("../../model/categoryScheema")
const mongoose = require("mongoose");

const loadcheckOut = async (req, res) => {
  try {
    let userId;
    if (req.user && req.user._id) {
      userId = req.user._id;
    } else if (req.session.user) {
      userId =
        typeof req.session.user === "string" ||
        req.session.user instanceof mongoose.Types.ObjectId
          ? req.session.user
          : req.session.user._id;
    } else {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }

    const userCart = await cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const validItems = [];
    for (const item of userCart.items) {
      const product = item.productId;
      if (!product) {
        continue; 
      }

     
      if (!product.isActive) {
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
  req.flash("warning", "Some items were removed from your cart. Please shop again.");
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
      user: user,
    });
  } catch (error) {
    console.error("Unable to load the checkout page:", error);
    res.status(500).json({ success: false, message: "Server issue" });
  }
};

const selectDeliveryAddress = async (req, res) => {
  try {
    const { addressId } = req.body;
    const userId = req.user?.id || req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

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
    const userId = req.user?.id || req.session.user;
    if (!userId) {
      return res.redirect("/login");
    }

    // Fetch the user's cart and populate product details
    const userCart = await cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      req.flash("warning", "Your cart is empty. Please shop again.");
      return res.redirect("/");
    }

    // Validate cart items
    const validItems = [];
    for (const item of userCart.items) {
      const product = item.productId;
      if (!product) {
        continue; // Skip if product is not found
      }

      if (!product.isActive) {
        continue; // Skip blocked products
      }

      const category = await Category.findById(product.categoryId);
      if (!category || !category.isListed) {
        continue; // Skip products from unlisted categories
      }

      validItems.push(item);
    }

    // Update cart with valid items
    userCart.items = validItems;
    await userCart.save();

    // If no valid items remain, redirect to home
    if (!userCart.items.length) {
      req.flash("warning", "Some items were removed from your cart. Please shop again.");
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
      user: await User.findById(userId),
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
