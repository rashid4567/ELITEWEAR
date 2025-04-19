const Cart = require("../model/cartScheema");

const addCartCount = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (userId) {
      const userCart = await Cart.findOne({ userId }).lean();
      res.locals.cartCount = userCart ? userCart.items.reduce((total, item) => total + item.quantity, 0) : 0;
    } else {
      res.locals.cartCount = 0;
    }
    next();
  } catch (error) {
    console.error("Error in cartCount middleware:", error);
    res.locals.cartCount = 0;
    next();
  }
};

module.exports = addCartCount;