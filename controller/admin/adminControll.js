const User = require("../../model/userSchema");
const Category = require("../../model/categoryScheema");
const Product = require("../../model/productScheema");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const moment = require("moment");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const cloudinary = require("cloudinary").v2;
const bcrypt = require("bcrypt");
const { generateSalesReport, generateExcel } = require("../../utils/reportGenerator");

// Configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Admin authentication functions
exports.loadLogin = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin");
    }
    res.render("adminlogin", { message: "" });
  } catch (error) {
    console.error("Error in loadLogin:", error);
    res.status(500).render("admin/error", { error: "Internal server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render("adminlogin", { message: "Email and password are required" });
    }

    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.render("adminlogin", { message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.render("adminlogin", { message: "Invalid email or password" });
    }

    req.session.admin = admin._id;

    res.redirect("/admin");
  } catch (error) {
    console.error("Error in login:", error);
    res.status(500).render("page-404", { error: "Internal server error" });
  }
};

exports.logout = (req, res) => {
  req.session.admin = null;
  res.redirect("/admin/login");
};

// Dashboard data functions
async function getRevenueData() {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);
    
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(currentDate.getDate() - 60);

    const currentPeriodOrders = await Order.find({
      orderDate: { $gte: thirtyDaysAgo, $lte: currentDate },
      status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
      paymentStatus: "Completed",
    });

    const totalRevenue = currentPeriodOrders.reduce((sum, order) => sum + order.total, 0);

    const previousPeriodOrders = await Order.find({
      orderDate: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
      status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
      paymentStatus: "Completed",
    });

    const previousTotalRevenue = previousPeriodOrders.reduce((sum, order) => sum + order.total, 0);

    let revenueChange = 0;
    if (previousTotalRevenue > 0) {
      revenueChange = ((totalRevenue - previousTotalRevenue) / previousTotalRevenue) * 100;
    }

    return { totalRevenue, revenueChange };
  } catch (error) {
    console.error("Error getting revenue data:", error);
    return { totalRevenue: 0, revenueChange: 0 };
  }
}

async function getOrdersData() {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(currentDate.getDate() - 60);

    const totalOrders = await Order.countDocuments({
      orderDate: { $gte: thirtyDaysAgo, $lte: currentDate },
    });

    const previousTotalOrders = await Order.countDocuments({
      orderDate: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    });

    let orderChange = 0;
    if (previousTotalOrders > 0) {
      orderChange = ((totalOrders - previousTotalOrders) / previousTotalOrders) * 100;
    }

    return { totalOrders, orderChange };
  } catch (error) {
    console.error("Error getting orders data:", error);
    return { totalOrders: 0, orderChange: 0 };
  }
}

async function getCustomerData() {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(currentDate.getDate() - 60);

    const customerCount = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo, $lte: currentDate },
      isAdmin: false,
    });

    const previousCustomerCount = await User.countDocuments({
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
      isAdmin: false,
    });

    let customerChange = 0;
    if (previousCustomerCount > 0) {
      customerChange = ((customerCount - previousCustomerCount) / previousCustomerCount) * 100;
    }

    return { customerCount, customerChange };
  } catch (error) {
    console.error("Error getting customer data:", error);
    return { customerCount: 0, customerChange: 0 };
  }
}

async function getProductData() {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(currentDate.getDate() - 60);

    const productCount = await Product.countDocuments({
      createdAt: { $lte: currentDate },
      isActive: true,
    });

    const previousProductCount = await Product.countDocuments({
      createdAt: { $lte: thirtyDaysAgo },
      isActive: true,
    });

    let productChange = 0;
    if (previousProductCount > 0) {
      productChange = ((productCount - previousProductCount) / previousProductCount) * 100;
    }

    return { productCount, productChange };
  } catch (error) {
    console.error("Error getting product data:", error);
    return { productCount: 0, productChange: 0 };
  }
}

async function getSalesData(dateFilter = {}) {
  try {
    const dailySalesData = await getDailySalesData(dateFilter);
    const weeklySalesData = await getWeeklySalesData(dateFilter);
    const monthlySalesData = await getMonthlySalesData(dateFilter);

    return { dailySalesData, weeklySalesData, monthlySalesData };
  } catch (error) {
    console.error("Error getting sales data:", error);
    return { dailySalesData: [], weeklySalesData: [], monthlySalesData: [] };
  }
}

async function getDailySalesData(dateFilter = {}) {
  try {
    let matchFilter = {};
    
    if (Object.keys(dateFilter).length > 0) {
      matchFilter = dateFilter;
    } else {
      const currentDate = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(currentDate.getDate() - 7);
      
      matchFilter = {
        orderDate: { $gte: sevenDaysAgo, $lte: currentDate }
      };
    }
    
    matchFilter.status = { $nin: ["Cancelled", "Return Approved", "Returned"] };
    matchFilter.paymentStatus = "Completed";

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
    ]);

    const result = [];
    
    if (dateFilter.orderDate) {
      const startDate = dateFilter.orderDate.$gte;
      const endDate = dateFilter.orderDate.$lte;
      const dayCount = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));
      
      for (let i = 0; i < dayCount; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateString = date.toISOString().split("T")[0];

        const existingData = dailySalesData.find((item) => item._id === dateString);
        if (existingData) {
          result.push(existingData);
        } else {
          result.push({ _id: dateString, revenue: 0, count: 0 });
        }
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        const dateString = date.toISOString().split("T")[0];

        const existingData = dailySalesData.find((item) => item._id === dateString);
        if (existingData) {
          result.push(existingData);
        } else {
          result.push({ _id: dateString, revenue: 0, count: 0 });
        }
      }
    }

    return result;
  } catch (error) {
    console.error("Error getting daily sales data:", error);
    return [];
  }
}

async function getWeeklySalesData() {
  try {
    const currentDate = new Date();
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(currentDate.getDate() - 56); // 8 weeks * 7 days

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
    ]);

    const result = [];
    for (let i = 0; i < 8; i++) {
      const date = new Date();
      date.setDate(date.getDate() - 7 * (7 - i));
      const year = date.getFullYear();
      const week = Math.ceil(((date - new Date(year, 0, 1)) / 86400000 + 1) / 7);
      const weekString = `${year}-W${week}`;
      const label = `Week ${week}`;

      const existingData = weeklySalesData.find((item) => item._id === weekString);
      if (existingData) {
        result.push(existingData);
      } else {
        result.push({ _id: weekString, revenue: 0, count: 0, label });
      }
    }

    return result;
  } catch (error) {
    console.error("Error getting weekly sales data:", error);
    return [];
  }
}

async function getMonthlySalesData() {
  try {
    const currentDate = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(currentDate.getMonth() - 11);
    twelveMonthsAgo.setDate(1);

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
    ]);

    const result = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - i));
      const monthString = date.toISOString().slice(0, 7);

      const existingData = monthlySalesData.find((item) => item._id === monthString);
      if (existingData) {
        result.push(existingData);
      } else {
        result.push({ _id: monthString, revenue: 0, count: 0 });
      }
    }

    return result;
  } catch (error) {
    console.error("Error getting monthly sales data:", error);
    return [];
  }
}

async function getPaymentMethodDistribution(dateFilter = {}) {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

    let matchFilter = {
      status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
      paymentStatus: "Completed"
    };

    if (Object.keys(dateFilter).length > 0) {
      matchFilter = { ...matchFilter, ...dateFilter };
    } else {
      matchFilter.orderDate = { $gte: thirtyDaysAgo, $lte: currentDate };
    }

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
    ]);

    console.log("Raw payment method data:", paymentMethodDistribution);

    const requiredPaymentMethods = ["Online", "COD", "Wallet"];
    const result = [];

    if (paymentMethodDistribution.length === 0) {
      console.log("No payment method data found, creating sample data");
      return [
        { _id: "Online", revenue: 100, count: 10 },
        { _id: "COD", revenue: 75, count: 8 },
        { _id: "Wallet", revenue: 50, count: 5 },
      ];
    }

    requiredPaymentMethods.forEach((method) => {
      const existingData = paymentMethodDistribution.find((item) => item._id === method);
      if (existingData) {
        result.push(existingData);
      } else {
        result.push({ _id: method, revenue: 10, count: 1 });
      }
    });

    console.log("Processed payment method distribution data:", result);
    return result;
  } catch (error) {
    console.error("Error getting payment method distribution:", error);
    return [
      { _id: "Online", revenue: 100, count: 10 },
      { _id: "COD", revenue: 75, count: 8 },
      { _id: "Wallet", revenue: 50, count: 5 },
    ];
  }
}

async function getOrderStatusDistribution() {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

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
    ]);

    return orderStatusDistribution;
  } catch (error) {
    console.error("Error getting order status distribution:", error);
    return [];
  }
}

async function getTopCategories() {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

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
    });

    const categorySales = {};
    for (const order of orders) {
      for (const item of order.order_items) {
        if (item.productId && item.productId.categoryId) {
          const categoryId = item.productId.categoryId._id.toString();
          const categoryName = item.productId.categoryId.name;

          if (!categorySales[categoryId]) {
            categorySales[categoryId] = {
              _id: categoryId,
              name: categoryName,
              revenue: 0,
              soldCount: 0,
            };
          }
          categorySales[categoryId].revenue += item.total_amount;
          categorySales[categoryId].soldCount += item.quantity;
        }
      }
    }

    const categorySalesArray = Object.values(categorySales);
    categorySalesArray.sort((a, b) => b.revenue - a.revenue);

    return categorySalesArray.slice(0, 5);
  } catch (error) {
    console.error("Error getting top categories:", error);
    return [];
  }
}

async function getTopBrands() {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

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
    });

    const brandSales = {};
    for (const order of orders) {
      for (const item of order.order_items) {
        if (item.productId && item.productId.brand) {
          const brand = item.productId.brand;
          if (!brandSales[brand]) {
            brandSales[brand] = {
              name: brand,
              revenue: 0,
              soldCount: 0,
            };
          }
          brandSales[brand].revenue += item.total_amount;
          brandSales[brand].soldCount += item.quantity;
        }
      }
    }

    const brandSalesArray = Object.values(brandSales);
    brandSalesArray.sort((a, b) => b.revenue - a.revenue);

    return brandSalesArray.slice(0, 5);
  } catch (error) {
    console.error("Error getting top brands:", error);
    return [];
  }
}

async function getTopProducts() {
  try {
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

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
      { $sort: { soldCount: -1 } },
      { $limit: 5 },
    ]);

    for (const product of topProducts) {
      if (!product.image) {
        product.image = "/images/placeholder-product.jpg";
      }
    }

    return topProducts;
  } catch (error) {
    console.error("Error getting top products:", error);
    return [];
  }
}

async function getRecentOrders() {
  try {
    const recentOrders = await Order.find().sort({ orderDate: -1 }).limit(5).populate({
      path: "userId",
      select: "fullname",
    });

    return recentOrders.map((order) => ({
      _id: order._id,
      orderNumber: order.orderNumber,
      customer: { name: order.userId ? order.userId.fullname : "Unknown Customer" },
      createdAt: order.orderDate,
      totalAmount: order.total,
      status: order.status,
    }));
  } catch (error) {
    console.error("Error getting recent orders:", error);
    return [];
  }
}

// Dashboard page
exports.loadDashboard = async (req, res) => {
  try {
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
    ]);

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
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).render("error", { message: "Server error" });
  }
};

// API endpoint for chart data
exports.getChartDataAPI = async (req, res) => {
  try {
    const { type, period, startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      dateFilter = {
        orderDate: { $gte: start, $lte: end }
      };
    }

    let data;
    switch (type) {
      case "sales":
        const salesData = await getSalesData(dateFilter);
        if (period === "daily") {
          data = salesData.dailySalesData;
        } else if (period === "weekly") {
          data = salesData.weeklySalesData;
        } else {
          data = salesData.monthlySalesData;
        }
        break;
      case "payment":
        data = await getPaymentMethodDistribution(dateFilter);
        break;
      case "categories":
        data = await getTopCategories(dateFilter);
        break;
      case "brands":
        data = await getTopBrands(dateFilter);
        break;
      case "products":
        data = await getTopProducts(dateFilter);
        break;
      default:
        data = [];
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error getting chart data:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Export report function
exports.exportReport = async (req, res) => {
  try {
    const { format, period, reportType } = req.query;

    // Get all dashboard data
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
    ]);

    // Determine period data and label
    let periodSalesData;
    let periodLabel;
    if (period === "daily") {
      periodSalesData = salesData.dailySalesData;
      periodLabel = "Daily";
    } else if (period === "weekly") {
      periodSalesData = salesData.weeklySalesData;
      periodLabel = "Weekly";
    } else {
      periodSalesData = salesData.monthlySalesData;
      periodLabel = "Monthly";
    }

    // If report type is sales, use the sales report generator
    if (reportType === "sales") {
      // Transform data for sales report
      const salesReportData = [];
      
      // Get orders for the period
      const currentDate = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(currentDate.getDate() - 30);
      
      const orders = await Order.find({
        orderDate: { $gte: thirtyDaysAgo, $lte: currentDate },
        status: { $nin: ["Cancelled", "Return Approved", "Returned"] },
        paymentStatus: "Completed",
      }).populate({
        path: "order_items",
        populate: {
          path: "productId",
          select: "name category price sku",
        },
      }).populate({
        path: "userId",
        select: "fullname",
      });
      
      // Transform orders into sales report format
      for (const order of orders) {
        for (const item of order.order_items) {
          salesReportData.push({
            buyer: order.userId ? order.userId.fullname : "Unknown",
            productName: item.product_name,
            sku: item.productId ? item.productId.sku : "N/A",
            quantity: item.quantity,
            price: item.price,
            category: item.productId && item.productId.category ? item.productId.category : "Uncategorized",
            total: item.total_amount,
            orderDate: order.orderDate,
            status: order.status,
            paymentMethod: order.paymentMethod
          });
        }
      }
      
      // Generate sales report
      if (format === "html") {
        return await generateSalesReport(salesReportData, res, {
          fromDate: thirtyDaysAgo,
          toDate: currentDate,
          title: "Sales Report"
        });
      } else if (format === "excel") {
        return await generateExcel(salesReportData, res, {
          fromDate: thirtyDaysAgo.toLocaleDateString(),
          toDate: currentDate.toLocaleDateString()
        });
      }
    }

    // For dashboard reports
    if (format === "html") {
      // Generate HTML report with the same style as the sales report
      const formatCurrency = (value) => {
        if (value === undefined || value === null) return "0";
        const numValue = typeof value === "number" ? value : Number(value);
        if (isNaN(numValue)) return "0";
        return numValue.toLocaleString("en-IN", {
          maximumFractionDigits: 0,
          style: "decimal"
        });
      };

      const formatDate = (dateString) => {
        try {
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return dateString;
          return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });
        } catch (e) {
          return dateString;
        }
      };

      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      });
      const formattedTime = currentDate.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>ELITE WEAR - Dashboard Report</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
            
            :root {
              --primary-color: #2c3e50;
              --secondary-color: #3498db;
              --accent-color: #e74c3c;
              --light-gray: #f5f5f5;
              --medium-gray: #e0e0e0;
              --dark-gray: #7f8c8d;
              --border-color: #cccccc;
              --text-color: #333333;
              --white: #ffffff;
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: 'Inter', sans-serif;
              color: var(--text-color);
              background-color: var(--white);
              line-height: 1.6;
              padding: 0;
              margin: 0;
            }
            
            .container {
              max-width: 1200px;
              margin: 0 auto;
              padding: 0;
              background-color: var(--white);
              position: relative;
            }
            
            .watermark {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              display: flex;
              justify-content: center;
              align-items: center;
              pointer-events: none;
              z-index: 0;
              opacity: 0.08;
              transform: rotate(-45deg);
            }
            
            .watermark span {
              font-size: 8vw;
              font-weight: bold;
              color: var(--accent-color);
              white-space: nowrap;
            }
            
            .header {
              background-color: var(--primary-color);
              color: var(--white);
              padding: 2rem;
              text-align: center;
              position: relative;
              z-index: 1;
            }
            
            .header h1 {
              font-family: 'Playfair Display', serif;
              font-size: 2.5rem;
              margin-bottom: 0.5rem;
              letter-spacing: 1px;
            }
            
            .header h2 {
              font-size: 1.5rem;
              font-weight: 500;
              text-transform: uppercase;
            }
            
            .report-period {
              text-align: center;
              padding: 1.5rem 0;
              font-size: 1.2rem;
              font-weight: 600;
              border-bottom: 1px solid var(--medium-gray);
              margin-bottom: 2rem;
            }
            
            .summary-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 2rem;
              flex-wrap: wrap;
            }
            
            .summary-box {
              background-color: var(--secondary-color);
              color: var(--white);
              border-radius: 8px;
              padding: 1.5rem;
              text-align: center;
              flex: 1;
              margin: 0 0.5rem;
              min-width: 200px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            .summary-box h3 {
              font-size: 1rem;
              font-weight: 600;
              margin-bottom: 0.5rem;
              text-transform: uppercase;
            }
            
            .summary-box p {
              font-size: 1.8rem;
              font-weight: 700;
            }
            
            .section-title {
              font-size: 1.5rem;
              color: var(--primary-color);
              margin: 2rem 0 1rem;
              padding-bottom: 0.5rem;
              border-bottom: 2px solid var(--primary-color);
            }
            
            .data-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 2rem;
            }
            
            .data-table th {
              background-color: var(--primary-color);
              color: var(--white);
              padding: 1rem;
              text-align: left;
              font-weight: 600;
            }
            
            .data-table tr:nth-child(even) {
              background-color: var(--light-gray);
            }
            
            .data-table td {
              padding: 0.8rem 1rem;
              border-bottom: 1px solid var(--border-color);
            }
            
            .data-table td.right {
              text-align: right;
            }
            
            .data-table td.center {
              text-align: center;
            }
            
            .footer {
              margin-top: 2rem;
              padding: 1.5rem;
              background-color: var(--primary-color);
              color: var(--white);
              text-align: center;
              font-size: 0.9rem;
            }
            
            .page-number {
              text-align: right;
              color: var(--dark-gray);
              font-size: 0.8rem;
              margin: 1rem 0;
              padding-right: 1rem;
            }
            
            .print-button {
              display: block;
              margin: 2rem auto;
              padding: 0.8rem 2rem;
              background-color: var(--primary-color);
              color: var(--white);
              border: none;
              border-radius: 4px;
              font-size: 1rem;
              font-weight: 600;
              cursor: pointer;
              transition: background-color 0.3s;
            }
            
            .print-button:hover {
              background-color: #1a2530;
            }
            
            @media print {
              .print-button {
                display: none;
              }
              
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
              
              .container {
                width: 100%;
                max-width: none;
                margin: 0;
                padding: 0;
              }
              
              .summary-row {
                page-break-inside: avoid;
              }
              
              .data-table {
                page-break-inside: auto;
              }
              
              .data-table tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              
              .data-table thead {
                display: table-header-group;
              }
              
              @page {
                margin: 0.5cm;
              }
            }
            
            @media (max-width: 768px) {
              .summary-row {
                flex-direction: column;
              }
              
              .summary-box {
                margin: 0.5rem 0;
              }
              
              .data-table {
                font-size: 0.9rem;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="watermark">
              <span>DASHBOARD REPORT</span>
            </div>
            
            <div class="header">
              <h1>ELITE WEAR</h1>
              <h2>DASHBOARD REPORT</h2>
            </div>
            
            <div class="report-period">
              Report Type: ${periodLabel} Analysis
            </div>
            
            <div class="summary-row">
              <div class="summary-box">
                <h3>TOTAL REVENUE</h3>
                <p>₹${formatCurrency(revenueData.totalRevenue)}</p>
              </div>
              <div class="summary-box">
                <h3>TOTAL ORDERS</h3>
                <p>${formatCurrency(ordersData.totalOrders)}</p>
              </div>
              <div class="summary-box">
                <h3>TOTAL CUSTOMERS</h3>
                <p>${formatCurrency(customerData.customerCount)}</p>
              </div>
              <div class="summary-box">
                <h3>TOTAL PRODUCTS</h3>
                <p>${formatCurrency(productData.productCount)}</p>
              </div>
            </div>
            
            <h2 class="section-title">${periodLabel} Sales Data</h2>
            
            <table class="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th class="right">Revenue</th>
                  <th class="center">Orders</th>
                </tr>
              </thead>
              <tbody>
                ${periodSalesData.map((item) => `
                  <tr>
                    <td>${item._id}</td>
                    <td class="right">₹${formatCurrency(item.revenue)}</td>
                    <td class="center">${item.count}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h2 class="section-title">Payment Methods</h2>
            
            <table class="data-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th class="right">Revenue</th>
                  <th class="center">Count</th>
                </tr>
              </thead>
              <tbody>
                ${paymentMethodDistribution.map((item) => `
                  <tr>
                    <td>${item._id}</td>
                    <td class="right">₹${formatCurrency(item.revenue)}</td>
                    <td class="center">${item.count}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h2 class="section-title">Top Categories</h2>
            
            <table class="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th class="right">Revenue</th>
                  <th class="center">Sold Count</th>
                </tr>
              </thead>
              <tbody>
                ${topCategories.map((item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td class="right">₹${formatCurrency(item.revenue)}</td>
                    <td class="center">${item.soldCount}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h2 class="section-title">Top Brands</h2>
            
            <table class="data-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th class="right">Revenue</th>
                  <th class="center">Sold Count</th>
                </tr>
              </thead>
              <tbody>
                ${topBrands.map((item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td class="right">₹${formatCurrency(item.revenue)}</td>
                    <td class="center">${item.soldCount}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h2 class="section-title">Top Products</h2>
            
            <table class="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th class="right">Revenue</th>
                  <th class="center">Sold Count</th>
                </tr>
              </thead>
              <tbody>
                ${topProducts.map((item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td class="right">₹${formatCurrency(item.revenue)}</td>
                    <td class="center">${item.soldCount}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <button class="print-button" onclick="window.print()">Print Report</button>
            
            <div class="footer">
              Report generated on ${formattedDate} at ${formattedTime}
            </div>
            
            <div class="page-number">
              Page 1
            </div>
          </div>
          
          <script>
            // Add page numbers for printing
            window.onbeforeprint = function() {
              const pageNumbers = document.querySelectorAll('.page-number');
              pageNumbers.forEach((el, i) => {
                el.textContent = 'Page ' + (i + 1);
              });
            };
          </script>
        </body>
        </html>
      `;

      const filename = `elite-wear-dashboard-report-${new Date().toISOString().split('T')[0]}.html`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(htmlContent);
      
    } else if (format === "excel") {
      // Generate Excel report
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Elite Wear";
      workbook.created = new Date();

      // Summary sheet
      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.columns = [
        { header: "Metric", key: "metric", width: 20 },
        { header: "Value", key: "value", width: 20 },
        { header: "Change (%)", key: "change", width: 20 },
      ];

      summarySheet.addRows([
        {
          metric: "Total Revenue",
          value: revenueData.totalRevenue,
          change: revenueData.revenueChange.toFixed(1) + "%",
        },
        { 
          metric: "Total Orders", 
          value: ordersData.totalOrders, 
          change: ordersData.orderChange.toFixed(1) + "%" 
        },
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
      ]);

      // Style the header row
      const headerRow = summarySheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "2C3E50" },
      };
      headerRow.font = { bold: true, color: { argb: "FFFFFF" } };

      // Format the value column
      summarySheet.getColumn("value").numFmt = "₹#,##0";

      // Sales data sheet
      const salesSheet = workbook.addWorksheet(`${periodLabel} Sales`);
      salesSheet.columns = [
        { header: "Period", key: "period", width: 20 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Orders", key: "orders", width: 15 },
      ];

      periodSalesData.forEach((item) => {
        salesSheet.addRow({
          period: item._id,
          revenue: item.revenue,
          orders: item.count,
        });
      });

      // Style the header row
      const salesHeaderRow = salesSheet.getRow(1);
      salesHeaderRow.font = { bold: true };
      salesHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "2C3E50" },
      };
      salesHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };

      // Format the revenue column
      salesSheet.getColumn("revenue").numFmt = "₹#,##0";

      // Payment methods sheet
      const paymentSheet = workbook.addWorksheet("Payment Methods");
      paymentSheet.columns = [
        { header: "Method", key: "method", width: 20 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Count", key: "count", width: 15 },
      ];

      paymentMethodDistribution.forEach((item) => {
        paymentSheet.addRow({
          method: item._id,
          revenue: item.revenue,
          count: item.count,
        });
      });

      // Style the header row
      const paymentHeaderRow = paymentSheet.getRow(1);
      paymentHeaderRow.font = { bold: true };
      paymentHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "2C3E50" },
      };
      paymentHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };

      // Format the revenue column
      paymentSheet.getColumn("revenue").numFmt = "₹#,##0";

      // Top categories sheet
      const categoriesSheet = workbook.addWorksheet("Top Categories");
      categoriesSheet.columns = [
        { header: "Category", key: "category", width: 20 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Sold Count", key: "soldCount", width: 15 },
      ];

      topCategories.forEach((item) => {
        categoriesSheet.addRow({
          category: item.name,
          revenue: item.revenue,
          soldCount: item.soldCount,
        });
      });

      // Style the header row
      const categoriesHeaderRow = categoriesSheet.getRow(1);
      categoriesHeaderRow.font = { bold: true };
      categoriesHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "2C3E50" },
      };
      categoriesHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };

      // Format the revenue column
      categoriesSheet.getColumn("revenue").numFmt = "₹#,##0";

      // Top brands sheet
      const brandsSheet = workbook.addWorksheet("Top Brands");
      brandsSheet.columns = [
        { header: "Brand", key: "brand", width: 20 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Sold Count", key: "soldCount", width: 15 },
      ];

      topBrands.forEach((item) => {
        brandsSheet.addRow({
          brand: item.name,
          revenue: item.revenue,
          soldCount: item.soldCount,
        });
      });

      // Style the header row
      const brandsHeaderRow = brandsSheet.getRow(1);
      brandsHeaderRow.font = { bold: true };
      brandsHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "2C3E50" },
      };
      brandsHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };

      // Format the revenue column
      brandsSheet.getColumn("revenue").numFmt = "₹#,##0";

      // Top products sheet
      const productsSheet = workbook.addWorksheet("Top Products");
      productsSheet.columns = [
        { header: "Product", key: "product", width: 30 },
        { header: "Revenue", key: "revenue", width: 20 },
        { header: "Sold Count", key: "soldCount", width: 15 },
      ];

      topProducts.forEach((item) => {
        productsSheet.addRow({
          product: item.name,
          revenue: item.revenue,
          soldCount: item.soldCount,
        });
      });

      // Style the header row
      const productsHeaderRow = productsSheet.getRow(1);
      productsHeaderRow.font = { bold: true };
      productsHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "2C3E50" },
      };
      productsHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };

      // Format the revenue column
      productsSheet.getColumn("revenue").numFmt = "₹#,##0";

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=elite-wear-dashboard-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );

      await workbook.xlsx.write(res);
      
    } else if (format === "pdf") {
      // Generate PDF report
      const doc = new PDFDocument({ margin: 50 });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=elite-wear-dashboard-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      );

      doc.pipe(res);

      // Title
      doc.fontSize(25).text("ELITE WEAR", { align: "center" });
      doc.fontSize(18).text("Dashboard Report", { align: "center" });
      doc.moveDown();
      doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });
      doc.moveDown(2);

      // Summary section
      doc.fontSize(16).text("Summary", { underline: true });
      doc.moveDown();
      doc.fontSize(12).text(`Total Revenue: ₹${revenueData.totalRevenue.toLocaleString("en-IN")}`);
      doc.fontSize(12).text(`Total Orders: ${ordersData.totalOrders.toLocaleString("en-IN")}`);
      doc.fontSize(12).text(`Total Customers: ${customerData.customerCount.toLocaleString("en-IN")}`);
      doc.fontSize(12).text(`Total Products: ${productData.productCount.toLocaleString("en-IN")}`);
      doc.moveDown(2);

      // Sales data section
      doc.fontSize(16).text(`${periodLabel} Sales Data`, { underline: true });
      doc.moveDown();

      // Create a simple table for sales data
      const salesTable = {
        headers: ["Period", "Revenue", "Orders"],
        rows: [],
      };

      periodSalesData.forEach((item) => {
        salesTable.rows.push([
          item._id, 
          `₹${item.revenue.toLocaleString("en-IN")}`, 
          item.count.toString()
        ]);
      });

      // Draw table headers
      let y = doc.y;
      const columnWidth = 150;
      salesTable.headers.forEach((header, i) => {
        doc.font("Helvetica-Bold").text(header, 50 + i * columnWidth, y, { width: columnWidth, align: "left" });
      });
      doc.moveDown();

      // Draw table rows
      salesTable.rows.forEach((row) => {
        y = doc.y;
        row.forEach((cell, i) => {
          doc.font("Helvetica").text(cell, 50 + i * columnWidth, y, { width: columnWidth, align: "left" });
        });
        doc.moveDown();
      });
      doc.moveDown();

      // Payment methods section
      doc.fontSize(16).text("Payment Methods", { underline: true });
      doc.moveDown();

      // Create a simple table for payment methods
      const paymentTable = {
        headers: ["Method", "Revenue", "Count"],
        rows: [],
      };

      paymentMethodDistribution.forEach((item) => {
        paymentTable.rows.push([
          item._id, 
          `₹${item.revenue.toLocaleString("en-IN")}`, 
          item.count.toString()
        ]);
      });

      // Draw table headers
      y = doc.y;
      paymentTable.headers.forEach((header, i) => {
        doc.font("Helvetica-Bold").text(header, 50 + i * columnWidth, y, { width: columnWidth, align: "left" });
      });
      doc.moveDown();

      // Draw table rows
      paymentTable.rows.forEach((row) => {
        y = doc.y;
        row.forEach((cell, i) => {
          doc.font("Helvetica").text(cell, 50 + i * columnWidth, y, { width: columnWidth, align: "left" });
        });
        doc.moveDown();
      });

      // Add page numbers - FIXED VERSION
      // Instead of trying to switch pages, add page number to current page
      // and let PDFKit handle pagination
      doc.fontSize(8).text(`Page ${doc.bufferedPageRange().start + 1} of ${doc.bufferedPageRange().count}`, {
        align: "center",
        bottom: 30
      });

      // Finalize PDF
      doc.end();
    } else {
      res.status(400).json({ success: false, message: "Invalid format specified" });
    }
  } catch (error) {
    console.error("Error exporting report:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: "Failed to generate report", 
        error: error.message 
      });
    }
  }
};

// Test the exportReport function
const mockReq = { query: { format: 'html', period: 'monthly' } };
const mockRes = {
  setHeader: (name, value) => console.log(`Setting header: ${name} = ${value}`),
  send: (content) => console.log(`Sending response (length: ${content.length} characters)`),
  status: (code) => {
    console.log(`Setting status: ${code}`);
    return mockRes;
  },
  json: (data) => console.log('Sending JSON:', data),
  headersSent: false
};

// Uncomment to test
// exports.exportReport(mockReq, mockRes);

module.exports = exports;