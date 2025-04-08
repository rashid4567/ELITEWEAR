const express = require('express');
const router = express.Router();
const adminControll = require('../controller/admin/adminControll');
const customerController = require("../controller/admin/customerController");
const CategoryController = require("../controller/admin/categoryController");
const productManagment = require('../controller/admin/productController');
const BannerController = require('../controller/admin/BannerController');
const upload = require('../middleware/cluadinaryConfig'); 
const { userAuth, adminAuth } = require('../middleware/auth');

router.get('/', adminAuth, adminControll.loadDashboard);
router.get('/login', adminControll.loadLogin);
router.post('/login', adminControll.login);
router.get('/dashboard', adminAuth, (req, res) => res.redirect('/admin'));
router.get('/logout', adminAuth, adminControll.logout);

router.get("/customers", adminAuth, customerController.customerInfo); 
router.post("/blockCustomer", adminAuth, customerController.customerBlocked);
router.post("/unblockCustomer", adminAuth, customerController.customerUnblocked);

router.get("/categories", adminAuth, CategoryController.categoryInfo);
router.post("/addcategory", adminAuth, CategoryController.addCategory);
router.post("/toggle-category", adminAuth, CategoryController.toggleCategory);
router.get('/editCategory', adminAuth, CategoryController.geteditCategory);
router.post('/editCategory', adminAuth, CategoryController.editCategory);
router.post('/delete-category', adminAuth, CategoryController.deleteCategory);

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
    productManagment.addproduct 
);
router.get("/editProduct/:id", adminAuth, productManagment.geteditProduct);
router.post(
    "/editProduct/:id",
    adminAuth,
    upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'additionalImage1', maxCount: 1 },
        { name: 'additionalImage2', maxCount: 1 },
        { name: 'additionalImage3', maxCount: 1 }
    ]),
    productManagment.editProduct
);


router.delete("/deleteProduct/:id", adminAuth, productManagment.deleteProduct);


router.post('/listProduct/:id', adminAuth, productManagment.listProduct);
router.post('/unlistProduct/:id', adminAuth, productManagment.UnlistProduct);

router.get('/getbannerPage', adminAuth, BannerController.getbannerPage);
router.get("/addBanner", adminAuth, BannerController.getaddBanner);
router.post("/addBanner", adminAuth, upload.single('posterImage'), BannerController.addBanner);

module.exports = router;