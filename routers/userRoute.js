const express = require('express');
const router = express.Router();
const userControllers = require('../controller/user/userControll');
const passport = require('../config/passport');
const { profile } = require('console');
const User = require('../model/userSChema'); 

router.get("/verify-otp", (req, res) => {
  const email = req.session.userData ? req.session.userData.email : '';
  res.render("verify-otp", { email, user: null });
});
router.post("/verify-otp", userControllers.verifyOtp);
router.post('/resendotp', userControllers.resendOtp);

router.get('/login', userControllers.userLogin);
router.post('/login', userControllers.login);

router.get('/logout', userControllers.logout);

router.get('/signup', userControllers.loadUserSignup);
router.post('/signup', userControllers.userSignup);
router.get('/', userControllers.loadHomepage);
router.get('/page-not-found', userControllers.pageNotfound);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
  res.redirect('/');
});


router.use((req, res) => {
  res.status(404).redirect('/page-not-found');
});

module.exports = router;