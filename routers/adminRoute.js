const express = require("express")
const router = express.Router()
const adminControll = require("../controller/admin/adminControll")
const customerController = require("../controller/admin/customerController")
const CategoryController = require("../controller/admin/categoryController")
const productManagment = require("../controller/admin/productController")
const BannerController = require("../controller/admin/BannerController")
const adminorderController = require("../controller/admin/adminOrderController")
const CouponController = require("../controller/admin/CounponController")
const salesontroller = require("../controller/admin/salesController")
const adminWalletController = require("../controller/admin/adminWalletController")
const upload = require("../middleware/cluadinaryConfig")
const { userAuth, adminAuth } = require("../middleware/auth")

router.get("/", adminAuth, adminControll.loadDashboard)
router.get("/login", adminControll.loadLogin)
router.post("/login", adminControll.login)
router.get("/dashboard", adminAuth, (req, res) => res.redirect("/admin"))
router.get("/logout", adminAuth, adminControll.logout)

router.get("/customers", adminAuth, customerController.customerInfo)
router.post("/blockCustomer", adminAuth, customerController.customerBlocked)
router.post("/unblockCustomer", adminAuth, customerController.customerUnblocked)

router.get("/categories", adminAuth, CategoryController.categoryInfo)
router.post("/addcategory", adminAuth, CategoryController.addCategory)
router.post("/toggle-category", adminAuth, CategoryController.toggleCategory)
router.get("/editCategory", adminAuth, CategoryController.geteditCategory)
router.post("/editCategory", adminAuth, CategoryController.editCategory)
router.post("/delete-category", adminAuth, CategoryController.deleteCategory)

router.get("/productManagment", adminAuth, productManagment.ProductManagement)
router.get("/addProduct", adminAuth, productManagment.getaddproduct)
router.post(
  "/addProduct",
  adminAuth,
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "additionalImage1", maxCount: 1 },
    { name: "additionalImage2", maxCount: 1 },
    { name: "additionalImage3", maxCount: 1 },
  ]),
  productManagment.addproduct,
)
router.get("/editProduct/:id", adminAuth, productManagment.geteditProduct)
router.post(
  "/editProduct/:id",
  adminAuth,
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "additionalImage1", maxCount: 1 },
    { name: "additionalImage2", maxCount: 1 },
    { name: "additionalImage3", maxCount: 1 },
  ]),
  productManagment.editProduct,
)

router.delete("/deleteProduct/:id", adminAuth, productManagment.deleteProduct)
router.post("/listProduct/:id", adminAuth, productManagment.listProduct)
router.post("/unlistProduct/:id", adminAuth, productManagment.UnlistProduct)

router.get("/getbannerPage", adminAuth, BannerController.getbannerPage)
router.get("/addBanner", adminAuth, BannerController.getaddBanner)
router.post("/addBanner", adminAuth, upload.single("posterImage"), BannerController.addBanner)

// Order management routes
router.get("/adminorder", adminAuth, adminorderController.getorderController)
router.post("/orders/update-status", adminAuth, adminorderController.updateOrderStatus)
router.get("/orders/:id", adminAuth, adminorderController.getOrderDetails)
router.post("/orders/return/:id", adminAuth, adminorderController.manageReturn)
router.get("/invoices/:id", adminAuth, adminorderController.admindownloadInvoice)
router.get("/orders/item/:orderItemId/can-update", adminAuth, adminorderController.checkItemUpdateability)
router.get("/orders/:orderId/can-update", adminAuth, adminorderController.checkOrderUpdateability)
router.post("/orders/item/:orderItemId/update-status", adminAuth, adminorderController.updateOrderItemStatus)
router.post("/orders/item/:orderItemId/approve-return", adminAuth, adminorderController.approveReturnItem)
router.post("/orders/item/:orderItemId/complete-return", adminAuth, adminorderController.completeReturnItem)
router.post("/orders/item/:orderItemId/reject-return", adminAuth, adminorderController.rejectReturnItem)

// Coupon Routes
router.get("/coupons", adminAuth, CouponController.renderCouponsPage)
router.get("/addCoupon", adminAuth, CouponController.renderAddCouponPage)
router.get("/editCoupon/:id", adminAuth, CouponController.renderEditCouponPage)
router.post("/createCoupon", adminAuth, CouponController.createCoupon)
router.get("/getAllCoupons", adminAuth, CouponController.getAllCoupons)
router.post("/editCoupon/:id", adminAuth, CouponController.editCoupon)
router.post("/toggleCouponStatus/:id", adminAuth, CouponController.toggleCouponStatus)
router.delete("/deleteCoupon/:id", adminAuth, CouponController.deleteCoupon)

router.get("/sales", adminAuth, salesontroller.loadsales)
router.get("/sales/download-pdf", adminAuth, salesontroller.downloadSalesPDF)
router.get("/sales/download-excel", adminAuth, salesontroller.downloadSalesExcel)

// Wallet and refund management routes
router.get("/wallet-transactions", adminAuth, adminWalletController.getAllWalletTransactions)
router.get("/refund-transactions", adminAuth, adminWalletController.getRefundTransactions)
router.get("/user-wallet/:userId", adminAuth, adminWalletController.getUserWallet)
router.get("/refund-statistics", adminAuth, adminWalletController.getRefundStatistics)
router.post("/process-manual-refund", adminAuth, adminWalletController.processManualRefund)
router.get("/refund-details/:transactionRef", adminAuth, adminWalletController.getRefundDetails)

module.exports = router
