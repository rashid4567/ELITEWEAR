const User = require("../../model/userSchema")
const Order = require("../../model/orderSchema")
const Product = require("../../model/productScheema")
const OrderItem = require("../../model/orderItemSchema")
const { generateSalesReport, generateExcel } = require("../../utils/reportGenerator")

const loadsales = async (req, res) => {
  try {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const { from, to, search, discount, discountType, page = 1, discountFilter } = req.query
    const limit = 10
    const skip = (page - 1) * limit

    const dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: "Delivered",
    }

    const orders = await Order.find(dateFilter)
      .populate({
        path: "userId",
        select: "fullname email",
      })
      .populate({
        path: "couponId",
        select: "coupencode couponpercent description",
      })
      .populate({
        path: "order_items",
        populate: [
          {
            path: "productId",
            select: "name categoryId offer effectiveDiscount discountSource",
            populate: {
              path: "categoryId",
              select: "name",
            },
          },
          {
            path: "couponId",
            select: "coupencode couponpercent description",
          }
        ],
      })
      .sort({ orderDate: -1 })

    let salesData = []
    let uniqueCoupons = new Set()

    for (const order of orders) {
      // Track coupon usage
      if (order.couponApplied && order.couponCode) {
        uniqueCoupons.add(order.couponCode)
      }

      for (const item of order.order_items) {
        if (!item.productId) continue

        // Correctly extract discount information from the OrderItem
        const discountPerUnit = item.discountPerUnit || 0
        const discountAmount = item.discountAmount || discountPerUnit * item.quantity || 0
        const discountPercentage =
          item.couponDiscountPercent ||
          (discountPerUnit > 0 && item.price > 0 ? Math.round((discountPerUnit / item.price) * 100) : 0)

        // Get product discount details
        const productOffer = item.productId.offer || 0
        const productEffectiveDiscount = item.productId.effectiveDiscount || 0
        const productDiscountSource = item.productId.discountSource || 'none'

        // Get coupon details
        const couponApplied = item.couponApplied || order.couponApplied || false
        const couponCode = item.couponCode || order.couponCode || ''
        const couponPercent = item.couponDiscountPercent || order.couponDiscountPercent || 0
        const couponDetails = item.couponId || order.couponId || null

        const saleEntry = {
          buyer: order.userId ? order.userId.fullname : "Unknown",
          productName: item.product_name,
          productId: item.productId._id,
          sku: `#${item.productId._id.toString().slice(-5)}`,
          quantity: item.quantity,
          price: item.price,
          discount: discountAmount,
          discountPercentage: discountPercentage,
          category: item.productId.categoryId ? item.productId.categoryId.name : "Uncategorized",
          total: item.total_amount,
          orderDate: order.orderDate,
          status: order.status,
          paymentMethod: order.paymentMethod,
          // Add product discount information
          productOffer: productOffer,
          productEffectiveDiscount: productEffectiveDiscount,
          productDiscountSource: productDiscountSource,
          // Add coupon information
          couponApplied: couponApplied,
          couponCode: couponCode,
          couponPercent: couponPercent,
          couponDescription: couponDetails ? couponDetails.description : '',
          orderNumber: order.orderNumber
        }

        salesData.push(saleEntry)
      }
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase()
      salesData = salesData.filter(
        (item) =>
          item.buyer.toLowerCase().includes(searchLower) ||
          item.productName.toLowerCase().includes(searchLower) ||
          item.sku.toLowerCase().includes(searchLower) ||
          item.category.toLowerCase().includes(searchLower) ||
          item.couponCode.toLowerCase().includes(searchLower) ||
          item.orderNumber.toLowerCase().includes(searchLower),
      )
    }

    // Apply discount filter if provided
    if (discountFilter) {
      if (discountFilter === "with-discount") {
        salesData = salesData.filter((item) => item.discount > 0 || item.productOffer > 0 || item.couponApplied)
      } else if (discountFilter === "no-discount") {
        salesData = salesData.filter((item) => item.discount === 0 && item.productOffer === 0 && !item.couponApplied)
      } else if (discountFilter === "coupon-only") {
        salesData = salesData.filter((item) => item.couponApplied)
      } else if (discountFilter === "product-offer-only") {
        salesData = salesData.filter((item) => item.productOffer > 0)
      }
    }

    const totalReports = salesData.length
    const totalPages = Math.ceil(totalReports / limit)

    const totalSales = salesData.reduce((sum, item) => sum + (item.total || 0), 0)
    const totalItems = salesData.reduce((sum, item) => sum + item.quantity, 0)
    const uniqueCustomers = new Set(salesData.map((item) => item.buyer)).size
    const totalDiscounts = salesData.reduce((sum, item) => sum + (item.discount || 0), 0)
    
    // Calculate total product discounts
    const totalProductDiscounts = salesData.reduce((sum, item) => {
      // Calculate the actual discount amount from product offer
      const productDiscountAmount = (item.price * (item.productEffectiveDiscount || 0) / 100) * item.quantity
      return sum + productDiscountAmount
    }, 0)

    // Calculate total coupon discounts
    const totalCouponDiscounts = salesData.reduce((sum, item) => {
      if (item.couponApplied) {
        // If we have the exact discount amount, use it
        if (item.discount > 0) {
          return sum + item.discount
        }
        // Otherwise calculate based on percentage
        const couponDiscountAmount = (item.price * (item.couponPercent || 0) / 100) * item.quantity
        return sum + couponDiscountAmount
      }
      return sum
    }, 0)

    // Count orders with coupons
    const ordersWithCoupons = salesData.filter(item => item.couponApplied).length
    const couponUsageCount = uniqueCoupons.size

    const paginatedSalesData = salesData.slice(skip, skip + limit)

    res.render("sales", {
      salesData: paginatedSalesData,
      totalSales,
      totalItems,
      totalDiscounts,
      totalProductDiscounts,
      totalCouponDiscounts,
      uniqueCustomers,
      ordersWithCoupons,
      couponUsageCount,
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      searchQuery: search || "",
      currentPage: Number.parseInt(page),
      totalPages,
      totalReports,
      discountFilter: discountFilter || "",
    })
  } catch (error) {
    console.error("Unable to load the sales page:", error)
    return res.status(500).json({ success: false, message: "Server error" })
  }
}

const downloadSalesPDF = async (req, res) => {
  try {
    const { from, to, search, discount, discountType } = req.query

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: "Delivered",
    }

    const orders = await Order.find(dateFilter)
      .populate({
        path: "userId",
        select: "fullname email",
      })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          select: "name categoryId",
          populate: {
            path: "categoryId",
            select: "name",
          },
        },
      })
      .sort({ orderDate: -1 })

    let salesData = []

    for (const order of orders) {
      for (const item of order.order_items) {
        if (!item.productId) continue

        // Correctly extract discount information from the OrderItem
        const discountPerUnit = item.discountPerUnit || 0
        const discountAmount = item.discountAmount || discountPerUnit * item.quantity || 0
        const discountPercentage =
          item.couponDiscountPercent ||
          (discountPerUnit > 0 && item.price > 0 ? Math.round((discountPerUnit / item.price) * 100) : 0)

        const saleEntry = {
          buyer: order.userId ? order.userId.fullname : "Unknown",
          productName: item.product_name,
          productId: item.productId._id,
          sku: `#${item.productId._id.toString().slice(-5)}`,
          quantity: item.quantity,
          price: item.price,
          discount: discountAmount,
          discountPercentage: discountPercentage,
          category: item.productId.categoryId ? item.productId.categoryId.name : "Uncategorized",
          total: item.total_amount,
          orderDate: order.orderDate,
          status: order.status,
          paymentMethod: order.paymentMethod,
        }

        salesData.push(saleEntry)
      }
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase()
      salesData = salesData.filter(
        (item) =>
          item.buyer.toLowerCase().includes(searchLower) ||
          item.productName.toLowerCase().includes(searchLower) ||
          item.sku.toLowerCase().includes(searchLower) ||
          item.category.toLowerCase().includes(searchLower),
      )
    }

    // Apply discount filter if provided
    if (req.query.discountFilter) {
      if (req.query.discountFilter === "with-discount") {
        salesData = salesData.filter((item) => item.discount > 0)
      } else if (req.query.discountFilter === "no-discount") {
        salesData = salesData.filter((item) => item.discount === 0)
      }
    }

    await generateSalesReport(salesData, res, {
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      title: "Delivered Orders Sales Report",
    })
  } catch (error) {
    console.error("Error generating PDF:", error)
    return res.status(500).json({ success: false, message: "Failed to generate PDF" })
  }
}

const downloadSalesExcel = async (req, res) => {
  try {
    const { from, to, search, discount, discountType } = req.query

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: "Delivered",
    }

    const orders = await Order.find(dateFilter)
      .populate({
        path: "userId",
        select: "fullname email",
      })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          select: "name categoryId",
          populate: {
            path: "categoryId",
            select: "name",
          },
        },
      })
      .sort({ orderDate: -1 })

    let salesData = []

    for (const order of orders) {
      for (const item of order.order_items) {
        if (!item.productId) continue

        // Correctly extract discount information from the OrderItem
        const discountPerUnit = item.discountPerUnit || 0
        const discountAmount = item.discountAmount || discountPerUnit * item.quantity || 0
        const discountPercentage =
          item.couponDiscountPercent ||
          (discountPerUnit > 0 && item.price > 0 ? Math.round((discountPerUnit / item.price) * 100) : 0)

        const saleEntry = {
          buyer: order.userId ? order.userId.fullname : "Unknown",
          productName: item.product_name,
          productId: item.productId._id,
          sku: `#${item.productId._id.toString().slice(-5)}`,
          quantity: item.quantity,
          price: item.price,
          discount: discountAmount,
          discountPercentage: discountPercentage,
          category: item.productId.categoryId ? item.productId.categoryId.name : "Uncategorized",
          total: item.total_amount,
          orderDate: order.orderDate,
          status: order.status,
          paymentMethod: order.paymentMethod,
        }

        salesData.push(saleEntry)
      }
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase()
      salesData = salesData.filter(
        (item) =>
          item.buyer.toLowerCase().includes(searchLower) ||
          item.productName.toLowerCase().includes(searchLower) ||
          item.sku.toLowerCase().includes(searchLower) ||
          item.category.toLowerCase().includes(searchLower),
      )
    }

    // Apply discount filter if provided
    if (req.query.discountFilter) {
      if (req.query.discountFilter === "with-discount") {
        salesData = salesData.filter((item) => item.discount > 0)
      } else if (req.query.discountFilter === "no-discount") {
        salesData = salesData.filter((item) => item.discount === 0)
      }
    }

    await generateExcel(salesData, res, {
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      title: "Delivered Orders Sales Report",
      filename: "delivered_orders_sales_report.xlsx",
    })
  } catch (error) {
    console.error("Error generating Excel:", error)
    return res.status(500).json({ success: false, message: "Failed to generate Excel" })
  }
}

module.exports = {
  loadsales,
  downloadSalesPDF,
  downloadSalesExcel,
}
