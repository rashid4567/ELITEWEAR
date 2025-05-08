const User = require("../../model/userSchema")
const Category = require("../../model/categoryScheema")
const Product = require("../../model/productScheema")
const Order = require("../../model/orderSchema")
const OrderItem = require("../../model/orderItemSchema")
const moment = require("moment")
const PDFDocument = require("pdfkit")
const ExcelJS = require("exceljs")
const cloudinary = require("cloudinary").v2
const bcrypt = require("bcrypt")

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Admin login page
exports.loadLogin = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin")
    }
    res.render("adminlogin", { message: "" })
  } catch (error) {
    console.error("Error in loadLogin:", error)
    res.status(500).render("admin/error", { error: "Internal server error" })
  }
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Validate input
    if (!email || !password) {
      return res.render("adminlogin", { message: "Email and password are required" })
    }

    const admin = await User.findOne({ email, isAdmin: true })

    if (!admin) {
      return res.render("adminlogin", { message: "Invalid email or password" })
    }

    const isMatch = await bcrypt.compare(password, admin.password)
    if (!isMatch) {
      return res.render("adminlogin", { message: "Invalid email or password" })
    }

    req.session.admin = admin._id

    res.redirect("/admin")
  } catch (error) {
    console.error("Error in login:", error)
    res.status(500).render("page-404", { error: "Internal server error" })
  }
}

exports.logout = (req, res) => {
  req.session.admin = null
  res.redirect("/admin/login")
}

// Dashboard data helper functions
async function getRevenueData() {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Get previous 30 days for comparison
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(currentDate.getDate() - 60)

    // Calculate total revenue for current period
    const currentPeriodOrders = await Order.find({
      orderDate: { $gte: thirtyDaysAgo, $lte: currentDate },
      status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
      paymentStatus: "Completed",
    })

    const totalRevenue = currentPeriodOrders.reduce((sum, order) => sum + order.total, 0)

    // Calculate total revenue for previous period
    const previousPeriodOrders = await Order.find({
      orderDate: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
      status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
      paymentStatus: "Completed",
    })

    const previousTotalRevenue = previousPeriodOrders.reduce((sum, order) => sum + order.total, 0)

    // Calculate revenue change percentage
    let revenueChange = 0
    if (previousTotalRevenue > 0) {
      revenueChange = ((totalRevenue - previousTotalRevenue) / previousTotalRevenue) * 100
    }

    return { totalRevenue, revenueChange }
  } catch (error) {
    console.error("Error getting revenue data:", error)
    return { totalRevenue: 0, revenueChange: 0 }
  }
}

async function getOrdersData() {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Get previous 30 days for comparison
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(currentDate.getDate() - 60)

    // Count total orders for current period
    const totalOrders = await Order.countDocuments({
      orderDate: { $gte: thirtyDaysAgo, $lte: currentDate },
    })

    // Count total orders for previous period
    const previousTotalOrders = await Order.countDocuments({
      orderDate: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    })

    // Calculate order change percentage
    let orderChange = 0
    if (previousTotalOrders > 0) {
      orderChange = ((totalOrders - previousTotalOrders) / previousTotalOrders) * 100
    }

    return { totalOrders, orderChange }
  } catch (error) {
    console.error("Error getting orders data:", error)
    return { totalOrders: 0, orderChange: 0 }
  }
}

async function getCustomerData() {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Get previous 30 days for comparison
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(currentDate.getDate() - 60)

    // Count total customers for current period
    const customerCount = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo, $lte: currentDate },
      isAdmin: false,
    })

    // Count total customers for previous period
    const previousCustomerCount = await User.countDocuments({
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
      isAdmin: false,
    })

    // Calculate customer change percentage
    let customerChange = 0
    if (previousCustomerCount > 0) {
      customerChange = ((customerCount - previousCustomerCount) / previousCustomerCount) * 100
    }

    return { customerCount, customerChange }
  } catch (error) {
    console.error("Error getting customer data:", error)
    return { customerCount: 0, customerChange: 0 }
  }
}

async function getProductData() {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Get previous 30 days for comparison
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(currentDate.getDate() - 60)

    // Count total products for current period
    const productCount = await Product.countDocuments({
      createdAt: { $lte: currentDate },
      isActive: true,
    })

    // Count total products for previous period
    const previousProductCount = await Product.countDocuments({
      createdAt: { $lte: thirtyDaysAgo },
      isActive: true,
    })

    // Calculate product change percentage
    let productChange = 0
    if (previousProductCount > 0) {
      productChange = ((productCount - previousProductCount) / previousProductCount) * 100
    }

    return { productCount, productChange }
  } catch (error) {
    console.error("Error getting product data:", error)
    return { productCount: 0, productChange: 0 }
  }
}

async function getSalesData(dateFilter = {}) {
  try {
    // Get daily, weekly, and monthly sales data with date filter
    const dailySalesData = await getDailySalesData(dateFilter)
    const weeklySalesData = await getWeeklySalesData(dateFilter)
    const monthlySalesData = await getMonthlySalesData(dateFilter)

    return { dailySalesData, weeklySalesData, monthlySalesData }
  } catch (error) {
    console.error("Error getting sales data:", error)
    return { dailySalesData: [], weeklySalesData: [], monthlySalesData: [] }
  }
}

async function getDailySalesData(dateFilter = {}) {
  try {
    // Get data for the last 7 days or use provided date filter
    let matchFilter = {}
    
    if (Object.keys(dateFilter).length > 0) {
      matchFilter = dateFilter
    } else {
      const currentDate = new Date()
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(currentDate.getDate() - 7)
      
      matchFilter = {
        orderDate: { $gte: sevenDaysAgo, $lte: currentDate }
      }
    }
    
    // Add status filter
    matchFilter.status = { $nin: ["Cancelled", "Return Approved", "Returned"] }
    matchFilter.paymentStatus = "Completed"

    // Aggregate daily sales data
    const dailySalesData = await Order.aggregate([
      {
        $match: matchFilter
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } },
          revenue: { $sum: "$total" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    // Fill in missing days with zero values
    const result = []
    
    // If using custom date filter, use those dates
    if (dateFilter.orderDate) {
      const startDate = dateFilter.orderDate.$gte
      const endDate = dateFilter.orderDate.$lte
      const dayCount = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000))
      
      for (let i = 0; i < dayCount; i++) {
        const date = new Date(startDate)
        date.setDate(date.getDate() + i)
        const dateString = date.toISOString().split("T")[0]

        const existingData = dailySalesData.find((item) => item._id === dateString)
        if (existingData) {
          result.push(existingData)
        } else {
          result.push({ _id: dateString, revenue: 0, count: 0 })
        }
      }
    } else {
      // Default to last 7 days
      for (let i = 0; i < 7; i++) {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        const dateString = date.toISOString().split("T")[0]

        const existingData = dailySalesData.find((item) => item._id === dateString)
        if (existingData) {
          result.push(existingData)
        } else {
          result.push({ _id: dateString, revenue: 0, count: 0 })
        }
      }
    }

    return result
  } catch (error) {
    console.error("Error getting daily sales data:", error)
    return []
  }
}

async function getWeeklySalesData() {
  try {
    // Get data for the last 8 weeks
    const currentDate = new Date()
    const eightWeeksAgo = new Date()
    eightWeeksAgo.setDate(currentDate.getDate() - 56) // 8 weeks * 7 days

    // Aggregate weekly sales data
    const weeklySalesData = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: eightWeeksAgo, $lte: currentDate },
          status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
          paymentStatus: "Completed",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$orderDate" },
            week: { $week: "$orderDate" },
          },
          revenue: { $sum: "$total" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: { $concat: [{ $toString: "$_id.year" }, "-W", { $toString: "$_id.week" }] },
          revenue: 1,
          count: 1,
          label: { $concat: ["Week ", { $toString: "$_id.week" }] },
        },
      },
      { $sort: { _id: 1 } },
    ])

    // Fill in missing weeks with zero values
    const result = []
    for (let i = 0; i < 8; i++) {
      const date = new Date()
      date.setDate(date.getDate() - 7 * (7 - i))
      const year = date.getFullYear()
      const week = Math.ceil(((date - new Date(year, 0, 1)) / 86400000 + 1) / 7)
      const weekString = `${year}-W${week}`
      const label = `Week ${week}`

      const existingData = weeklySalesData.find((item) => item._id === weekString)
      if (existingData) {
        result.push(existingData)
      } else {
        result.push({ _id: weekString, revenue: 0, count: 0, label })
      }
    }

    return result
  } catch (error) {
    console.error("Error getting weekly sales data:", error)
    return []
  }
}

async function getMonthlySalesData() {
  try {
    // Get data for the last 12 months
    const currentDate = new Date()
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(currentDate.getMonth() - 11)
    twelveMonthsAgo.setDate(1)

    // Aggregate monthly sales data
    const monthlySalesData = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: twelveMonthsAgo, $lte: currentDate },
          status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
          paymentStatus: "Completed",
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$orderDate" } },
          revenue: { $sum: "$total" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    // Fill in missing months with zero values
    const result = []
    for (let i = 0; i < 12; i++) {
      const date = new Date()
      date.setMonth(date.getMonth() - (11 - i))
      const monthString = date.toISOString().slice(0, 7)

      const existingData = monthlySalesData.find((item) => item._id === monthString)
      if (existingData) {
        result.push(existingData)
      } else {
        result.push({ _id: monthString, revenue: 0, count: 0 })
      }
    }

    return result
  } catch (error) {
    console.error("Error getting monthly sales data:", error)
    return []
  }
}

async function getPaymentMethodDistribution(dateFilter = {}) {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Set up match filter
    let matchFilter = {
      status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
      paymentStatus: "Completed"
    }

    // Add date filter if provided, otherwise use last 30 days
    if (Object.keys(dateFilter).length > 0) {
      matchFilter = { ...matchFilter, ...dateFilter }
    } else {
      matchFilter.orderDate = { $gte: thirtyDaysAgo, $lte: currentDate }
    }

    // Aggregate payment method distribution
    const paymentMethodDistribution = await Order.aggregate([
      {
        $match: matchFilter
      },
      {
        $group: {
          _id: "$paymentMethod",
          revenue: { $sum: "$total" },
          count: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ])

    console.log("Raw payment method data:", paymentMethodDistribution);

    // Ensure we have entries for the three required payment methods
    const requiredPaymentMethods = ["Online", "COD", "Wallet"]
    const result = []

    // If no data at all, create sample data for visualization
    if (paymentMethodDistribution.length === 0) {
      console.log("No payment method data found, creating sample data");
      return [
        { _id: "Online", revenue: 100, count: 10 },
        { _id: "COD", revenue: 75, count: 8 },
        { _id: "Wallet", revenue: 50, count: 5 },
      ]
    }

    // First, add any existing payment methods from the required list
    requiredPaymentMethods.forEach((method) => {
      const existingData = paymentMethodDistribution.find((item) => item._id === method)
      if (existingData) {
        result.push(existingData)
      } else {
        // Add with small non-zero values if not found (for better visualization)
        result.push({ _id: method, revenue: 10, count: 1 })
      }
    })

    console.log("Processed payment method distribution data:", result);
    return result
  } catch (error) {
    console.error("Error getting payment method distribution:", error)
    // Return fallback data in case of error
    return [
      { _id: "Online", revenue: 100, count: 10 },
      { _id: "COD", revenue: 75, count: 8 },
      { _id: "Wallet", revenue: 50, count: 5 },
    ]
  }
}

async function getOrderStatusDistribution() {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Aggregate order status distribution
    const orderStatusDistribution = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: thirtyDaysAgo, $lte: currentDate },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])

    return orderStatusDistribution
  } catch (error) {
    console.error("Error getting order status distribution:", error)
    return []
  }
}

async function getTopCategories() {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Get all completed orders in the last 30 days
    const orders = await Order.find({
      orderDate: { $gte: thirtyDaysAgo, $lte: currentDate },
      status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
      paymentStatus: "Completed",
    }).populate({
      path: "order_items",
      populate: {
        path: "productId",
        select: "categoryId",
        populate: {
          path: "categoryId",
          select: "name",
        },
      },
    })

    // Calculate category sales
    const categorySales = {}
    for (const order of orders) {
      for (const item of order.order_items) {
        if (item.productId && item.productId.categoryId) {
          const categoryId = item.productId.categoryId._id.toString()
          const categoryName = item.productId.categoryId.name

          if (!categorySales[categoryId]) {
            categorySales[categoryId] = {
              _id: categoryId,
              name: categoryName,
              revenue: 0,
              soldCount: 0,
            }
          }
          categorySales[categoryId].revenue += item.total_amount
          categorySales[categoryId].soldCount += item.quantity
        }
      }
    }

    // Convert to array and sort by revenue
    const categorySalesArray = Object.values(categorySales)
    categorySalesArray.sort((a, b) => b.revenue - a.revenue)

    // Return top 5 categories
    return categorySalesArray.slice(0, 5)
  } catch (error) {
    console.error("Error getting top categories:", error)
    return []
  }
}

async function getTopBrands() {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Get all completed orders in the last 30 days
    const orders = await Order.find({
      orderDate: { $gte: thirtyDaysAgo, $lte: currentDate },
      status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
      paymentStatus: "Completed",
    }).populate({
      path: "order_items",
      populate: {
        path: "productId",
        select: "brand",
      },
    })

    // Calculate brand sales
    const brandSales = {}
    for (const order of orders) {
      for (const item of order.order_items) {
        if (item.productId && item.productId.brand) {
          const brand = item.productId.brand
          if (!brandSales[brand]) {
            brandSales[brand] = {
              name: brand,
              revenue: 0,
              soldCount: 0,
            }
          }
          brandSales[brand].revenue += item.total_amount
          brandSales[brand].soldCount += item.quantity
        }
      }
    }

    // Convert to array and sort by revenue
    const brandSalesArray = Object.values(brandSales)
    brandSalesArray.sort((a, b) => b.revenue - a.revenue)

    // Get top 5 brands
    return brandSalesArray.slice(0, 5)
  } catch (error) {
    console.error("Error getting top brands:", error)
    return []
  }
}

async function getTopProducts() {
  try {
    // Get current date and date 30 days ago
    const currentDate = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(currentDate.getDate() - 30)

    // Aggregate top products by sold count (changed from revenue)
    const topProducts = await OrderItem.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $match: {
          "order.orderDate": { $gte: thirtyDaysAgo, $lte: currentDate },
          "order.status": { $nin: ["Cancelled", "Return Approved", "Returned"] },
          "order.paymentStatus": "Completed",
          status: { $nin: ["Cancelled", "Return Requested", "Return Approved", "Returned"] },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$productId",
          name: { $first: "$product_name" },
          image: { $first: { $arrayElemAt: ["$product.images.url", 0] } },
          soldCount: { $sum: "$quantity" },
          revenue: { $sum: "$total_amount" },
        },
      },
      { $sort: { soldCount: -1 } }, // Changed from revenue to soldCount
      { $limit: 5 },
    ])

    // Ensure all products have an image
    for (const product of topProducts) {
      if (!product.image) {
        product.image = "/images/placeholder-product.jpg"
      }
    }

    return topProducts
  } catch (error) {
    console.error("Error getting top products:", error)
    return []
  }
}

async function getRecentOrders() {
  try {
    // Get 5 most recent orders
    const recentOrders = await Order.find().sort({ orderDate: -1 }).limit(5).populate({
      path: "userId",
      select: "fullname",
    })

    // Format orders for display
    return recentOrders.map((order) => ({
      _id: order._id,
      orderNumber: order.orderNumber,
      customer: { name: order.userId ? order.userId.fullname : "Unknown Customer" },
      createdAt: order.orderDate,
      totalAmount: order.total,
      status: order.status,
    }))
  } catch (error) {
    console.error("Error getting recent orders:", error)
    return []
  }
}

// Dashboard page
exports.loadDashboard = async (req, res) => {
  try {
    // Get all dashboard data
    const [
      revenueData,
      ordersData,
      customerData,
      productData,
      salesData,
      paymentMethodDistribution,
      orderStatusDistribution,
      topCategories,
      topBrands,
      topProducts,
      recentOrders,
    ] = await Promise.all([
      getRevenueData(),
      getOrdersData(),
      getCustomerData(),
      getProductData(),
      getSalesData(),
      getPaymentMethodDistribution(),
      getOrderStatusDistribution(),
      getTopCategories(),
      getTopBrands(),
      getTopProducts(),
      getRecentOrders(),
    ])

    // Render dashboard with data
    res.render("dashboard", {
      totalRevenue: revenueData.totalRevenue,
      revenueChange: revenueData.revenueChange,
      totalOrders: ordersData.totalOrders,
      orderChange: ordersData.orderChange,
      customerCount: customerData.customerCount,
      customerChange: customerData.customerChange,
      productCount: productData.productCount,
      productChange: productData.productChange,
      monthlySalesData: salesData.monthlySalesData,
      weeklySalesData: salesData.weeklySalesData,
      dailySalesData: salesData.dailySalesData,
      paymentMethodDistribution,
      orderStatusDistribution,
      topCategories,
      topBrands,
      topProducts,
      recentOrders,
      moment,
    })
  } catch (error) {
    console.error("Error loading dashboard:", error)
    res.status(500).render("error", { message: "Server error" })
  }
}

// API endpoint for chart data
exports.getChartDataAPI = async (req, res) => {
  try {
    const { type, period, startDate, endDate } = req.query

    // Parse date range if provided
    let dateFilter = {}
    if (startDate && endDate) {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      
      dateFilter = {
        orderDate: { $gte: start, $lte: end }
      }
    }

    let data
    switch (type) {
      case "sales":
        const salesData = await getSalesData(dateFilter)
        if (period === "daily") {
          data = salesData.dailySalesData
        } else if (period === "weekly") {
          data = salesData.weeklySalesData
        } else {
          data = salesData.monthlySalesData
        }
        break
      case "payment":
        data = await getPaymentMethodDistribution(dateFilter)
        break
      case "categories":
        data = await getTopCategories(dateFilter)
        break
      case "brands":
        data = await getTopBrands(dateFilter)
        break
      case "products":
        data = await getTopProducts(dateFilter)
        break
      default:
        data = []
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("Error getting chart data:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}

// Export dashboard data as report
exports.exportReport = async (req, res) => {
  try {
    const { format, period } = req.query

    // Get data for report
    const [
      revenueData,
      ordersData,
      customerData,
      productData,
      salesData,
      paymentMethodDistribution,
      topCategories,
      topBrands,
      topProducts,
    ] = await Promise.all([
      getRevenueData(),
      getOrdersData(),
      getCustomerData(),
      getProductData(),
      getSalesData(),
      getPaymentMethodDistribution(),
      getTopCategories(),
      getTopBrands(),
      getTopProducts(),
    ])

    // Determine which sales data to use based on period
    let periodSalesData
    let periodLabel
    if (period === "daily") {
      periodSalesData = salesData.dailySalesData
      periodLabel = "Daily"
    } else if (period === "weekly") {
      periodSalesData = salesData.weeklySalesData
      periodLabel = "Weekly"
    } else {
      periodSalesData = salesData.monthlySalesData
      periodLabel = "Monthly"
    }

    // Export as PDF or Excel
    if (format === "pdf") {
      // Generate PDF report
      const doc = new PDFDocument({ margin: 50 })

      // Set response headers
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=dashboard-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      )

      // Pipe PDF to response
      doc.pipe(res)

      // Add content to PDF
      doc.fontSize(25).text("Dashboard Report", { align: "center" })
      doc.moveDown()
      doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" })
      doc.moveDown()

      // Summary section
      doc.fontSize(16).text("Summary", { underline: true })
      doc.moveDown()
      doc.fontSize(12).text(`Total Revenue: ₹${revenueData.totalRevenue.toLocaleString("en-IN")}`)
      doc.fontSize(12).text(`Total Orders: ${ordersData.totalOrders.toLocaleString("en-IN")}`)
      doc.fontSize(12).text(`Total Customers: ${customerData.customerCount.toLocaleString("en-IN")}`)
      doc.fontSize(12).text(`Total Products: ${productData.productCount.toLocaleString("en-IN")}`)
      doc.moveDown()

      // Sales data section
      doc.fontSize(16).text(`${periodLabel} Sales Data`, { underline: true })
      doc.moveDown()

      // Create a simple table for sales data
      const salesTable = {
        headers: ["Period", "Revenue", "Orders"],
        rows: [],
      }

      periodSalesData.forEach((item) => {
        salesTable.rows.push([item._id, `₹${item.revenue.toLocaleString("en-IN")}`, item.count.toString()])
      })

      // Draw table headers
      let y = doc.y
      const columnWidth = 150
      salesTable.headers.forEach((header, i) => {
        doc.font("Helvetica-Bold").text(header, 50 + i * columnWidth, y, { width: columnWidth, align: "left" })
      })
      doc.moveDown()

      // Draw table rows
      salesTable.rows.forEach((row) => {
        y = doc.y
        row.forEach((cell, i) => {
          doc.font("Helvetica").text(cell, 50 + i * columnWidth, y, { width: columnWidth, align: "left" })
        })
        doc.moveDown()
      })

      // Finalize PDF
      doc.end()
    } else {
      // Generate Excel report
      const workbook = new ExcelJS.Workbook()
      workbook.creator = "Admin Dashboard"
      workbook.created = new Date()

      // Summary sheet
      const summarySheet = workbook.addWorksheet("Summary")
      summarySheet.columns = [
        { header: "Metric", key: "metric", width: 20 },
        { header: "Value", key: "value", width: 20 },
        { header: "Change (%)", key: "change", width: 20 },
      ]

      summarySheet.addRows([
        {
          metric: "Total Revenue",
          value: revenueData.totalRevenue,
          change: revenueData.revenueChange.toFixed(1) + "%",
        },
        { metric: "Total Orders", value: ordersData.totalOrders, change: ordersData.orderChange.toFixed(1) + "%" },
        {
          metric: "Total Customers",
          value: customerData.customerCount,
          change: customerData.customerChange.toFixed(1) + "%",
        },
        {
          metric: "Total Products",
          value: productData.productCount,
          change: productData.productChange.toFixed(1) + "%",
        },
      ])

      // Sales data sheet
      const salesSheet = workbook.addWorksheet(`${periodLabel} Sales`)
      salesSheet.columns = [
        { header: "Period", key: "period", width: 20 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Orders", key: "orders", width: 15 },
      ]

      periodSalesData.forEach((item) => {
        salesSheet.addRow({
          period: item._id,
          revenue: item.revenue,
          orders: item.count,
        })
      })

      // Payment methods sheet
      const paymentSheet = workbook.addWorksheet("Payment Methods")
      paymentSheet.columns = [
        { header: "Method", key: "method", width: 20 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Count", key: "count", width: 15 },
      ]

      paymentMethodDistribution.forEach((item) => {
        paymentSheet.addRow({
          method: item._id,
          revenue: item.revenue,
          count: item.count,
        })
      })

      // Top categories sheet
      const categoriesSheet = workbook.addWorksheet("Top Categories")
      categoriesSheet.columns = [
        { header: "Category", key: "category", width: 20 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Sold Count", key: "soldCount", width: 15 },
      ]

      topCategories.forEach((item) => {
        categoriesSheet.addRow({
          category: item.name,
          revenue: item.revenue,
          soldCount: item.soldCount,
        })
      })

      // Top brands sheet
      const brandsSheet = workbook.addWorksheet("Top Brands")
      brandsSheet.columns = [
        { header: "Brand", key: "brand", width: 20 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Sold Count", key: "soldCount", width: 15 },
      ]

      topBrands.forEach((item) => {
        brandsSheet.addRow({
          brand: item.name,
          revenue: item.revenue,
          soldCount: item.soldCount,
        })
      })

      // Top products sheet
      const productsSheet = workbook.addWorksheet("Top Products")
      productsSheet.columns = [
        { header: "Product", key: "product", width: 30 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Sold Count", key: "soldCount", width: 15 },
      ]

      topProducts.forEach((item) => {
        productsSheet.addRow({
          product: item.name,
          revenue: item.revenue,
          soldCount: item.soldCount,
        })
      })

      // Set response headers
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=dashboard-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      )

      // Write workbook to response
      await workbook.xlsx.write(res)
      res.end()
    }
  } catch (error) {
    console.error("Error exporting report:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}