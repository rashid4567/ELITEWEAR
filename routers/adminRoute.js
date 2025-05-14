const express = require("express")
const router = express.Router()
const adminControll = require("../controller/admin/adminControll")
const customerController = require("../controller/admin/customerController")
const CategoryController = require("../controller/admin/categoryController")
const productController = require("../controller/admin/productController")
const BannerController = require("../controller/admin/BannerController")
const adminorderController = require("../controller/admin/adminOrderController")
const CouponController = require("../controller/admin/CounponController")
const salesontroller = require("../controller/admin/salesController")
const adminWalletController = require("../controller/admin/adminWalletController")
const reviewController = require("../controller/admin/adminReviewController")
const profileController = require("../controller/admin/adminProfileController")
const upload = require("../middleware/cluadinaryConfig")
const { userAuth, adminAuth } = require("../middleware/auth")

// Dashboard routes
router.get("/", adminAuth, adminControll.loadDashboard)
router.get("/login", adminControll.loadLogin)
router.post("/login", adminControll.login)
router.get("/dashboard", adminAuth, (req, res) => res.redirect("/admin"))
router.get("/logout", adminAuth, adminControll.logout)

// Dashboard data API
router.get("/dashboard/chart-data", adminAuth, adminControll.getChartDataAPI)

// Export functionality
router.get("/dashboard/export", adminAuth, adminControll.exportReport)

// Customer management routes
router.get("/customers", adminAuth, customerController.customerInfo)
router.post("/blockCustomer", adminAuth, customerController.customerBlocked)
router.post("/unblockCustomer", adminAuth, customerController.customerUnblocked)
router.get('/customers/:id/details',adminAuth, customerController.getCustomerDetails);
router.get('/customers/:id/orders',adminAuth, customerController.getCustomerOrders);
router.get('/customers/:id/wallet',adminAuth, customerController.getCustomerWallet);
// Route for updating customer profile
router.post('/customers/:id/update',adminAuth, customerController.updateCustomerProfile);
// Category management routes
router.get("/categories", adminAuth, CategoryController.categoryInfo)
router.post("/addcategory", adminAuth, CategoryController.addCategory)
router.post("/toggle-category", adminAuth, CategoryController.toggleCategory)
router.get("/editCategory", adminAuth, CategoryController.geteditCategory)
router.post("/editCategory", adminAuth, CategoryController.editCategory)
router.post("/delete-category", adminAuth, CategoryController.deleteCategory)
router.get("/check-category-name", CategoryController.checkCategoryNameExists)

//ADMIN PROFILR
router.get("/profile", adminAuth, profileController.getAdminProfile)
router.post("/profile/change-password", adminAuth, profileController.changeAdminPassword)

// Product management routes
router.get("/productManagement", adminAuth, productController.ProductManagement)
router.get("/products", adminAuth, productController.ProductManagement) 
router.get("/products/add", adminAuth, productController.getaddproduct)
router.get("/add-product", adminAuth, productController.getaddproduct) 
router.post(
  "/add-product",
  adminAuth,
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "additionalImage1", maxCount: 1 },
    { name: "additionalImage2", maxCount: 1 },
    { name: "additionalImage3", maxCount: 1 },
  ]),
  productController.addproduct,
)
router.get("/check-sku", adminAuth, productController.checkSkuExists)
router.get("/edit-product/:id", adminAuth, productController.geteditProduct)
router.post(
  "/edit-product/:id",
  adminAuth,
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "additionalImage1", maxCount: 1 },
    { name: "additionalImage2", maxCount: 1 },
    { name: "additionalImage3", maxCount: 1 },
  ]),
  productController.editProduct,
)

// Product API routes
router.delete("/products/:id", adminAuth, productController.deleteProduct)
router.post("/products/:id/list", adminAuth, productController.listProduct)
router.post("/products/:id/unlist", adminAuth, productController.UnlistProduct)
router.post("/products/bulk-update-status", adminAuth, productController.bulkUpdateStatus)
router.delete("/products/bulk-delete", adminAuth, productController.bulkDeleteProducts)
router.post("/products/update-offer", adminAuth, productController.updateProductOffer)
router.get("/get-product-variants/:id", adminAuth, productController.getProductVariants)

// Banner management routes
router.get("/getbannerPage", adminAuth, BannerController.getbannerPage)
router.get("/banners", adminAuth, BannerController.getbannerPage) 
router.get("/addBanner", adminAuth, BannerController.getaddBanner)
router.post("/addBanner", adminAuth, upload.single("posterImage"), BannerController.addBanner)

// Order management routes
router.get("/adminorder", adminAuth, adminorderController.getorderController)
router.get("/orders", adminAuth, adminorderController.getorderController) 
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

// Sales routes
router.get("/sales", adminAuth, salesontroller.loadsales)
router.get("/analytics", adminAuth, salesontroller.loadsales) 
router.get("/sales/download-pdf", adminAuth, salesontroller.downloadSalesPDF)
router.get("/sales/download-excel", adminAuth, salesontroller.downloadSalesExcel)


// Wallet and refund management routes
router.get("/wallet-transactions", adminAuth, adminWalletController.getAllWalletTransactions)
router.get("/refund-transactions", adminAuth, adminWalletController.getRefundTransactions)
router.get("/user-wallet/:userId", adminAuth, adminWalletController.getUserWallet)
router.get("/refund-statistics", adminAuth, adminWalletController.getRefundStatistics)
router.post("/process-manual-refund", adminAuth, adminWalletController.processManualRefund)
router.get("/refund-details/:transactionRef", adminAuth, adminWalletController.getRefundDetails)

// Review management routes
router.get("/reviews", adminAuth, reviewController.getAllReviews)
router.get("/reviews/:id", adminAuth, reviewController.getReviewById)
router.post("/reviews/:id/approve", adminAuth, reviewController.approveReview)
router.post("/reviews/:id/reject", adminAuth, reviewController.rejectReview)
router.post("/reviews/:id/hide", adminAuth, reviewController.hideReview)
router.post("/reviews/:id/show", adminAuth, reviewController.showReview)
router.post("/reviews/:id/verify", adminAuth, reviewController.verifyReview)
router.delete("/reviews/:id", adminAuth, reviewController.deleteReview)
router.get("/review-statistics", adminAuth, reviewController.getReviewStatistics)

// Bulk review actions
router.post("/reviews/bulk/approve", adminAuth, reviewController.bulkApproveReviews)
router.post("/reviews/bulk/hide", adminAuth, reviewController.bulkHideReviews)

// Review export routes
router.get("/reviews/export", adminAuth, (req, res) => {
  const format = req.query.format || 'csv';
  if (format === 'csv') {
    reviewController.exportReviewsCSV(req, res);
  } else if (format === 'excel') {
    reviewController.exportReviewsExcel(req, res);
  } else {
    res.status(400).send("Invalid export format");
  }
})

// Settings route
router.get("/settings", adminAuth, (req, res) => {
  res.render("admin/settings")
})

module.exports = router