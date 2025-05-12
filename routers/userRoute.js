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
  const walletController = require("../controller/user/walletController");
  const referralController = require("../controller/user/referalController");
  const CouponController = require("../controller/user/userCouponCoontroller");
  const razorpayController = require("../controller/user/razzerpayController");
  const reviewController = require('../controller/user/reviewController');
  const contactController = require("../controller/user/contactController")
  const addCountsMiddleware = require("../middleware/addCountsMiddleware")
  const { UserAuth } = require("../middleware/auth");

  const { checkBlockedStatus } = userControllers;
router.use(addCountsMiddleware)
  // User authentication routes
  router.get("/signup", userControllers.loadUserSignup);
  router.post("/signup", userControllers.userSignup);
  router.get("/verify-otp", (req, res) => {
    const email =
      req.session.registration?.userData?.email || "unknown@email.com";
    res.render("verify-otp", { email, context: "signup" });
  });
  router.post("/verify-otp", userControllers.verifyOtp);
  router.post("/resend-otp", userControllers.resendOtp);

  router.get("/login", userControllers.userLogin);
  router.post("/login", userControllers.login);
  router.post("/apply-referral", UserAuth, userControllers.applyReferralCode);
  router.get("/", checkBlockedStatus, userControllers.loadHomepage);
  router.get("/logout", checkBlockedStatus, userControllers.logout);

  // Referral routes
  router.get("/referral", UserAuth, referralController.loadReferralPage);
  router.get("/referralSpace", referralController.loadReferralSpace);
  router.post("/validate-referral-code", referralController.validateReferralCode);
  router.post(
    "/process-signup-referral",
    referralController.processSignupReferral
  );
  router.post("/apply-referral", UserAuth, referralController.applyReferralCode);
  router.get("/referral-stats", UserAuth, referralController.getReferralStats);
  router.get(
    "/referral-history",
    UserAuth,
    referralController.getReferralHistory
  );

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
  router.get(
    "/verify-email-update-otp",
    UserAuth,
    profileController.loadVerifyEmailUpdateOtp
  );
  router.post(
    "/verify-email-update-otp",
    UserAuth,
    profileController.verifyUpdateOtp
  );
  router.post("/resend-update-otp", UserAuth, profileController.resendUpdateOtp);
  router.post("/update-profile", UserAuth, profileController.updateProfile);
  router.get(
    "/getupdatepassword",
    UserAuth,
    profileController.loadupdatePassword
  );
  router.post("/updatePassword", UserAuth, profileController.updatePassword);
  router.get("/logoutpage", UserAuth, profileController.loadLogout);

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
  router.post(
    "/add-to-cart-remove-wishlist",
    UserAuth,
    cartController.addToCartAndRemoveFromWishlist
  );
  router.post("/block-product", UserAuth, cartController.blockProduct);

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
  router.post('/validate-payment', UserAuth, checkOutController.validatePaymentMethod);
  router.get('/confirm-order', UserAuth, checkOutController.loadOrderConfirmation);

  // Add this route for wallet payment validation
  router.post('/validate-wallet-payment', UserAuth, checkOutController.validatePaymentMethod);

  // Order routes
  router.post("/place-order", UserAuth, orderController.placeOrder);
  router.get("/order-success", UserAuth, orderController.loadOrderSuccess);
  router.get("/orders", UserAuth, orderController.getUserOrders);
  router.post("/orders/cancel/:id", UserAuth, orderController.cancelOrder);
  router.post("/return-order/:id", UserAuth, orderController.initiateReturn);
  router.post("/reorder/:id", UserAuth, orderController.reOrder);
  router.get("/order-details/:id", UserAuth, orderController.getOrderDetails);
  router.get("/invoice/:id", UserAuth, orderController.downloadInvoice);
  router.get("/orders/track/:id", UserAuth, orderController.trackOrder);
  router.post("/cancel-order/:id", UserAuth, orderController.cancelOrder);
  router.post(
    "/cancel-order-item/:itemId",
    UserAuth,
    orderController.cancelOrderItem
  );
  router.post("/return-order/:id", UserAuth, orderController.initiateReturn);
  router.post(
    "/return-order-item/:itemId",
    UserAuth,
    orderController.returnOrderItem
  );

  router.post(
    "/orders/item/:orderItemId/cancel",
    UserAuth,
    orderController.cancelOrderItem
  );
  router.post(
    "/orders/item/:orderItemId/return",
    UserAuth,
    orderController.returnOrderItem
  );

  // Razorpay routes
  router.post(
    "/create-razorpay-order",
    UserAuth,
    razorpayController.createRazorpayOrder
  );
  router.post("/verify-payment", UserAuth, razorpayController.verifyPayment);
  router.post(
    "/retry-payment/:orderId",
    UserAuth,
    razorpayController.retryRazorpayPayment
  );

  router.post(
    "/handle-payment-failure/:id",
    UserAuth,
    orderController.handlePaymentFailure
  );
  router.get(
    "/payment-retry-options/:id",
    UserAuth,
    orderController.getPaymentRetryOptions
  );
  router.post(
    "/payment-retry-init/:id",
    UserAuth,
    orderController.initPaymentRetry
  );
  router.post(
    "/payment-status-update/:id",
    UserAuth,
    orderController.updatePaymentStatus
  );

  // Wallet routes
  router.get("/wallet", UserAuth, walletController.getwallet);
  router.post("/wallet/credit", UserAuth, walletController.creditWallet);
  router.post("/wallet/debit", UserAuth, walletController.debitWallet);

  // Enhanced Coupon Routes
  router.get("/allcoupons", UserAuth, CouponController.allCoupons);
  router.get("/coupons", UserAuth, CouponController.getAvailableCoupons);
  router.post("/apply-coupon", UserAuth, CouponController.applyCoupon);
  router.post("/remove-coupon", UserAuth, CouponController.removeCoupon);

  // Review routes
  router.get("/reviews", UserAuth, reviewController.getUserReviews);
  router.get("/product/:productId/reviews", reviewController.getProductReviews);
  router.delete("/review/:reviewId", UserAuth, reviewController.deleteReview);
  router.post("/review/:productId/:orderItemId", UserAuth, reviewController.submitOrderItemReview);
  router.post("/review/order-item/:productId/:orderItemId", UserAuth, reviewController.submitOrderItemReview);
  router.post("/review/submit", UserAuth, reviewController.submitReview);


  router.get("/contact",UserAuth, contactController.getContactPage)
router.post("/send",UserAuth, contactController.sendContactMessage)

  // Enhanced review functionality
  router.post("/api/reviews/helpful", UserAuth, productController.markReviewHelpful);
  router.get("/api/reviews/reload/:productId", productController.reloadReviews);
  router.get("/api/check-auth", productController.checkAuth);

  // Error handling
  router.get("/page-not-found", userControllers.pageNotfound);
  router.use((req, res) => {
    res.status(404).redirect("/page-not-found");
  });

  module.exports = router;