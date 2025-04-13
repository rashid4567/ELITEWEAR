const cart = require("../../model/cartScheema");
const product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const address = require("../../model/AddressScheema");
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
  
  module.exports = {
    loadcheckOut,
  };