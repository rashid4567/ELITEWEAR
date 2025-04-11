const express = require('express');
const router = express.Router();
const userControllers = require('../controller/user/userControll');
const productController = require("../controller/user/productControllers");
const passport = require('../config/passport');
const profileController = require("../controller/user/profileController");
const AddressController = require("../controller/user/addressController")
const {UserAuth, adminAuth} = require("../middleware/auth")

const { checkBlockedStatus } = userControllers;


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


router.get('/', checkBlockedStatus, userControllers.loadHomepage);
router.get('/logout', checkBlockedStatus, userControllers.logout);

router.get('/forgot-password', profileController.forgotPassword);
router.post('/forgot-email-id', profileController.forgotemailValidations);
router.get('/forgot-otp', (req, res) => {
    const email = req.session.email || 'unknown@email.com';
    console.log('GET /forgot-otp - Session data:', req.session);
    res.render("forgotOtp", { email });
});
router.get("/LoadProfile", UserAuth, profileController.loadProfile);
router.post('/forgot-otp', profileController.passForgotten);
router.post('/resend-forgot-otp', profileController.resendForgotOtp);
router.get('/reset-password', profileController.resetPasswordPage);
router.post('/reset-password', profileController.resetPassword);

router.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/signup',
        failureFlash: true
    }), 
    (req, res) => {
        req.session.user = req.user._id;
        res.redirect('/');
    }
);

router.get('/filterProducts', checkBlockedStatus, userControllers.filterProducts);

router.get('/productdetails', checkBlockedStatus, productController.productdetails); 
router.get('/productdetails/:id', checkBlockedStatus, productController.productdetails); 
router.get('/allproduct', checkBlockedStatus, userControllers.allproduct);
router.get("/aboutUs", checkBlockedStatus, userControllers.aboutUs);
router.get("/search", checkBlockedStatus, userControllers.searchProducts);


router.get("/getprofileEdit", UserAuth, profileController.loadProfileEdit)
router.post("/send-email-update-otp",UserAuth, profileController.sendemilUpdateOtp)
router.post("/verify-email-update-otp", UserAuth, profileController.verifyUpdateOtp)
router.post("/update-profile", UserAuth,profileController.updateProfile);

router.get("/address", UserAuth, AddressController.address)
router.get("/getaddAddress", UserAuth, AddressController.getaddAddress)
router.post("/add-address", UserAuth, AddressController.addAddress)

router.get('/page-not-found', userControllers.pageNotfound);
router.use((req, res) => {
    res.status(404).redirect('/page-not-found');
});

module.exports = router;