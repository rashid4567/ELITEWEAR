const express = require('express');
const router = express.Router();
const adminControll = require('../controller/admin/adminControll');
const customerController = require("../controller/admin/customerController");
const CategoryController = require("../controller/admin/categoryController");
const productManagment = require('../controller/admin/productController');
const upload = require('../middleware/cluadinaryConfig'); // Use Cloudinary config
const { userAuth, adminAuth } = require('../middleware/auth');

router.get('/', adminAuth, adminControll.loadDashboard);
router.get('/login', adminControll.loadLogin);
router.post('/login', adminControll.login);
router.get('/dashboard', adminAuth, (req, res) => res.redirect('/admin'));
router.get('/logout', adminAuth, adminControll.logout);


router.get("/customers", adminAuth, customerController.customerInfo); 
router.post("/blockCustomer", adminAuth, customerController.customerBlocked);
router.post("/unblockCustomer", adminAuth, customerController.customerUnblocked);



router.get("/categories", adminAuth, CategoryController.categoryInfo)
router.post("/addcategory", adminAuth, CategoryController.addCategory);
router.post("/toggle-category", adminAuth, CategoryController.toggleCategory);
router.get('/editCategory', adminAuth, CategoryController.geteditCategory)
router.post('/editCategory', adminAuth, CategoryController.editCategory)



router.get('/productManagment', adminAuth, productManagment.ProductManagement);
router.get("/addProduct", adminAuth, productManagment.getaddproduct);
router.post(
    "/addProduct",
    adminAuth,
    upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'additionalImage1', maxCount: 1 },
        { name: 'additionalImage2', maxCount: 1 },
        { name: 'additionalImage3', maxCount: 1 }
    ]),
    productManagment.addproduct // No need for processImages if Cloudinary handles transformations
);
module.exports = router;