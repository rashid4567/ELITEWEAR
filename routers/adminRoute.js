const express = require('express');
const router = express.Router();
const adminControll = require('../controller/admin/adminControll');
const customerController = require("../controller/admin/customerController");
const CategoryController = require("../controller/admin/categoryController")
const { userAuth, adminAuth } = require('../middleware/auth');


router.get('/login', adminControll.loadLogin);
router.post('/login', adminControll.login);
router.get('/', adminAuth, adminControll.loadDashboard);
router.get('/dashboard', adminAuth, (req, res) => res.redirect('/admin'));
router.get('/logout', adminAuth, adminControll.logout);


router.post("/blockCustomer", adminAuth, customerController.customerBlocked);
router.post("/unblockCustomer", adminAuth, customerController.customerUnblocked);
router.get("/customers", adminAuth, customerController.customerInfo); 


router.get("/categories", adminAuth, CategoryController.categoryInfo)
router.post("/addcategory", adminAuth, CategoryController.addCategory);

module.exports = router;