const Cart = require("../model/cartScheema");
const Wishlist = require("../model/whislistScheema");

const addCountsMiddleware = async (req, res, next) => {
  try {
    res.locals.cartCount = 0;
    res.locals.wishlistCount = 0;
    
    // Check if req.session exists before trying to access user
    if (req.session && req.session.user) {
      const userId = req.session.user;
      
      try {
        const userCart = await Cart.findOne({ userId }).lean();
        if (userCart && userCart.items) {
          res.locals.cartCount = userCart.items.reduce((total, item) => total + item.quantity, 0);
        }
      } catch (cartError) {
        console.error("Error fetching cart count:", cartError);
      }
      
      try {
        const userWishlist = await Wishlist.findOne({ user: userId }).lean();
        if (userWishlist && userWishlist.products) {
          res.locals.wishlistCount = userWishlist.products.length;
        }
      } catch (wishlistError) {
        console.error("Error fetching wishlist count:", wishlistError);
      }
    }
    
    next();
  } catch (error) {
    console.error("Error in counts middleware:", error);
    next();
  }
};

module.exports = addCountsMiddleware;