const express = require("express");
const router = express.Router();
const userControllers = require("../controller/user/userControll");
const productController = require("../controller/user/productControllers");
const passport = require("../config/passport");
const profileController = require("../controller/user/profileController");
const AddressController = require("../controller/user/addressController");
const whishlistController = require("../controller/user/whishlistController");
const checkOutController = require("../controller/user/checkOutController");
const orderController = require("../controller/user/orderController");
const cartController = require("../controller/user/cartController");
const { UserAuth } = require("../middleware/auth");

const { checkBlockedStatus } = userControllers;

// User authentication routes
router.get("/signup", userControllers.loadUserSignup);
router.post("/signup", userControllers.userSignup);
router.get("/verify-otp", (req, res) => {
  const email =
    req.session.registration?.userData?.email || "unknown@email.com";
  res.render("verify-otp", { email });
});
router.post("/verify-otp", userControllers.verifyOtp);
router.post("/resend-otp", userControllers.resendOtp);

router.get("/login", userControllers.userLogin);
router.post("/login", userControllers.login);

router.get("/", checkBlockedStatus, userControllers.loadHomepage);
router.get("/logout", checkBlockedStatus, userControllers.logout);

// Password reset routes
router.get("/forgot-password", profileController.forgotPassword);
router.post("/forgot-email-id", profileController.forgotemailValidations);
router.get("/forgot-otp", (req, res) => {
  const email = req.session.email || "unknown@email.com";
  res.render("forgotOtp", { email });
});
router.post("/forgot-otp", profileController.passForgotten);
router.post("/resend-forgot-otp", profileController.resendForgotOtp);
router.get("/reset-password", profileController.resetPasswordPage);
router.post("/reset-password", profileController.resetPassword);

// Google OAuth routes
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/signup",
    failureFlash: true,
  }),
  (req, res) => {
    req.session.user = req.user._id;
    res.redirect("/");
  }
);

// Product and search routes
router.get(
  "/filterProducts",
  checkBlockedStatus,
  userControllers.filterProducts
);
router.get(
  "/productdetails",
  checkBlockedStatus,
  productController.productdetails
);
router.get(
  "/productdetails/:id",
  checkBlockedStatus,
  productController.productdetails
);
router.get("/allproduct", checkBlockedStatus, userControllers.allproduct);
router.get("/aboutUs", checkBlockedStatus, userControllers.aboutUs);
router.get("/search", checkBlockedStatus, userControllers.searchProducts);

// Profile routes
router.get("/LoadProfile", UserAuth, profileController.loadProfile);
router.get("/getprofileEdit", UserAuth, profileController.loadProfileEdit);
router.post(
  "/send-email-update-otp",
  UserAuth,
  profileController.sendemilUpdateOtp
);
router.post(
  "/verify-email-update-otp",
  UserAuth,
  profileController.verifyUpdateOtp
);
router.post("/update-profile", UserAuth, profileController.updateProfile);

// Address routes
router.get("/address", UserAuth, AddressController.address);
router.get("/getaddAddress", UserAuth, AddressController.getaddAddress);
router.post("/add-address", UserAuth, AddressController.addAddress);
router.get("/getaddress-edit/:id", UserAuth, AddressController.geteditAddress);
router.put("/update-address/:id", UserAuth, AddressController.updateAddress);
router.delete("/remove-address/:id", UserAuth, AddressController.removeAddress);
router.put(
  "/set-default-address/:id",
  UserAuth,
  AddressController.setDefaultAddress
);

// Wishlist routes
router.get("/wishlist", UserAuth, whishlistController.getWishlist);
router.post("/addTowhislist", UserAuth, whishlistController.addToWishlist);
router.get("/wishlist/ids", UserAuth, whishlistController.getWishlistIds);
router.post("/wishlist/remove", UserAuth, whishlistController.removeWishlist);
router.post("/wishlist/empty", UserAuth, whishlistController.emptyWishlist);

// Cart routes
router.get("/cart", UserAuth, cartController.loadCart);
router.post("/cart/add", UserAuth, cartController.addToCart);
router.post("/cart/update", UserAuth, cartController.updateCartQuantity);
router.post("/cart/remove", UserAuth, cartController.removeFromCart);
router.post("/cart/empty", UserAuth, cartController.emptyCart);

// Checkout routes
router.get("/checkOut", UserAuth, checkOutController.loadcheckOut);
router.post(
  "/select-delivery-address",
  UserAuth,
  checkOutController.selectDeliveryAddress
);
router.get(
  "/checkout-payment",
  UserAuth,
  checkOutController.loadCheckoutPayment
);

// Order routes
router.post("/place-order", orderController.placeOrder);
router.get("/order-success", orderController.loadOrderSuccess);
router.get("/orders", orderController.getUserOrders);
router.post("/cancel-order/:id", orderController.cancelOrder);
router.post("/return-order/:id", orderController.initiateReturn);
router.post("/reorder/:id", orderController.reOrder);
router.get("/order-details/:id", orderController.getOrderDetails);
router.get("/invoice/:id", orderController.downloadInvoice);


// Error handling
router.get("/page-not-found", userControllers.pageNotfound);
router.use((req, res) => {
  res.status(404).redirect("/page-not-found");
});

module.exports = router;
