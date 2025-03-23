const express = require('express');
const router = express.Router();
const adminControll = require('../controller/admin/adminControll');

// Admin auth middleware
const isAdminAuth = (req, res, next) => {
    if (req.session.admin) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};


router.get('/login', adminControll.loadLogin);
router.post('/login', adminControll.login);
router.get('/', isAdminAuth, adminControll.loadDashboard);
router.get('/dashboard', isAdminAuth, (req, res) => {
    res.redirect('/admin');
});
router.get('/logout', isAdminAuth, adminControll.logout);

module.exports = router;