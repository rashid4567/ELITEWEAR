const express = require('express');
const router = express.Router();
const userControllers = require('../controller/user/userControll');
const productController = require("../controller/user/productControllers");
const passport = require('../config/passport');
const profileController = require("../controller/user/profileController");


router.get('/', userControllers.loadHomepage);


router.get('/signup', userControllers.loadUserSignup);
router.post('/signup', userControllers.userSignup);
router.get('/verify-otp', (req, res) => {
    const email = req.session.registration?.userData?.email || 'unknown@email.com';
    console.log('GET /verify-otp - Session data:', req.session);
    res.render("verify-otp", { email }); 
});
router.post('/verify-otp', userControllers.verifyOtp);
router.post('/resend-otp', userControllers.resendOtp);

router.get('/login', userControllers.userLogin);
router.post('/login', userControllers.login);
router.get('/logout', userControllers.logout);


router.get('/forgot-password', profileController.forgotPassword);
router.post('/forgot-email-id', profileController.forgotemailValidations);
router.get('/forgot-otp', (req, res) => {
    const email = req.session.email || 'unknown@email.com';
    console.log('GET /forgot-otp - Session data:', req.session);
    res.render("forgotOtp", { email });
});
router.post('/forgot-otp', profileController.passForgotten);
router.post('/resend-forgot-otp', profileController.resendForgotOtp);
router.get('/reset-password', profileController.resetPasswordPage);
router.post('/reset-password', profileController.resetPassword);


router.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/signup' }), 
    (req, res) => {
        req.session.user = req.user._id;
        res.redirect('/');
    }
);


router.get('/filterProducts', userControllers.filterProducts);
router.get('/productdetails', productController.productdetails);
router.get('/allproduct', userControllers.allproduct);
router.get("/aboutUs", userControllers.aboutUs)

router.get('/page-not-found', userControllers.pageNotfound);
router.use((req, res) => {
    res.status(404).redirect('/page-not-found');
});

module.exports = router;