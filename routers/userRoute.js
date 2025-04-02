const express = require('express');
const router = express.Router();
const userControllers = require('../controller/user/userControll');
const productController = require("../controller/user/productControllers");
const passport = require('../config/passport');
const profileController = require("../controller/user/profileController");

router.get('/', userControllers.loadHomepage);

router.get("/verify-otp", (req, res) => {
  console.log('GET /verify-otp - Session data:', req.session); 
  const email = req.session.email || 'unknown@email.com';
  res.render("forgotOtp", { email });  
});
router.post("/verify-otp", profileController.passForgotten); // Updated to use profileController
router.post('/resend-otp', profileController.resendForgotOtp); // Ensure this route matches the client-side AJAX request URL
router.get('/login', userControllers.userLogin);
router.post('/login', userControllers.login);
router.get('/logout', userControllers.logout);
router.get('/signup', userControllers.loadUserSignup);
router.post('/signup', userControllers.userSignup);

router.get('/page-not-found', userControllers.pageNotfound);

router.get("/forgot-password", profileController.forgotPassword);
router.post("/forgot-email-id", profileController.forgotemailValidations);
router.get("/reset-password", profileController.resetPasswordPage);
router.post("/reset-password", profileController.resetPassword);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
  res.redirect('/');
});

router.get('/filterProducts', userControllers.filterProducts);
router.get('/productdetails', productController.productdetails);
router.get('/allproduct', userControllers.allproduct);

router.use((req, res) => {
  res.status(404).redirect('/page-not-found');
});

module.exports = router;