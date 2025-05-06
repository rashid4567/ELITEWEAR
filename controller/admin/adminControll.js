const mongoose = require("mongoose");
const User = require("../../model/userSchema");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const Product = require("../../model/productScheema");
const Category = require("../../model/categoryScheema");
const bcrypt = require("bcrypt");
const moment = require("moment");

// Helper function to calculate percentage change
const calculatePercentChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous * 100).toFixed(1);
};

// Load login page
const loadLogin = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }
    res.render("adminlogin", { message: null });
  } catch (error) {
    console.error("Error loading login page:", error);
    res.render("adminlogin", { message: "An error occurred" });
  }
};

// Process login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({ email, isAdmin: true });

    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);

      if (passwordMatch) {
        req.session.admin = admin._id;

        req.session.save((err) => {
          if (err) {
            return res.render("adminlogin", { message: "Session error" });
          }
          return res.redirect("/admin/dashboard");
        });
      } else {
        return res.render("adminlogin", { message: "Invalid password" });
      }
    } else {
      console.error("Admin not found for email:", email);
      return res.render("adminlogin", { message: "Admin not found" });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.render("adminlogin", { message: "An error occurred" });
  }
};

// Load dashboard
const loadDashboard = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    // Get date range from query parameters or use default (last 7 days)
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate) 
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Set end of day for endDate
    endDate.setHours(23, 59, 59, 999);
    
    // Get admin details
    const admin = await User.findById(req.session.admin);
    
    // Get current page for ledger pagination
    const currentPage = parseInt(req.query.ledgerPage) || 1;
    const perPage = 5;
    
    // Get metrics data
    // 1. Total customers
    const totalCustomers = await User.countDocuments({ isAdmin: false });
    const previousCustomers = await User.countDocuments({ 
      isAdmin: false, 
      createdAt: { 
        $lt: startDate, 
        $gte: new Date(startDate.getTime() - (endDate - startDate)) 
      } 
    });
    const customersTrend = calculatePercentChange(totalCustomers - previousCustomers, previousCustomers);
    
    // 2. Total orders
    const totalOrders = await Order.countDocuments({ 
      orderDate: { $gte: startDate, $lte: endDate } 
    });
    const previousOrders = await Order.countDocuments({ 
      orderDate: { 
        $lt: startDate, 
        $gte: new Date(startDate.getTime() - (endDate - startDate)) 
      } 
    });
    const ordersTrend = calculatePercentChange(totalOrders, previousOrders);
    
    // 3. Total revenue
    const revenueData = await Order.aggregate([
      { $match: { orderDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;
    
    const previousRevenueData = await Order.aggregate([
      { 
        $match: { 
          orderDate: { 
            $lt: startDate, 
            $gte: new Date(startDate.getTime() - (endDate - startDate)) 
          } 
        } 
      },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    const previousRevenue = previousRevenueData.length > 0 ? previousRevenueData[0].total : 0;
    const revenueTrend = calculatePercentChange(totalRevenue, previousRevenue);
    
    // 4. Pending orders
    const pendingOrders = await Order.countDocuments({ 
      status: { $in: ["Pending", "Processing"] },
      orderDate: { $gte: startDate, $lte: endDate }
    });
    const previousPendingOrders = await Order.countDocuments({ 
      status: { $in: ["Pending", "Processing"] },
      orderDate: { 
        $lt: startDate, 
        $gte: new Date(startDate.getTime() - (endDate - startDate)) 
      }
    });
    const pendingOrdersTrend = calculatePercentChange(pendingOrders, previousPendingOrders);
    
    // 5. Sales progress
    const targetAmount = 100000; // Example target amount
    const salesProgress = (totalRevenue / targetAmount) * 100;
    const previousSalesProgress = (previousRevenue / targetAmount) * 100;
    const salesProgressTrend = salesProgress - previousSalesProgress;
    
    // 6. Today's revenue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRevenueData = await Order.aggregate([
      { $match: { orderDate: { $gte: today } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    const todayRevenue = todayRevenueData.length > 0 ? todayRevenueData[0].total : 0;
    
    // 7. Yesterday's revenue
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayRevenueData = await Order.aggregate([
      { 
        $match: { 
          orderDate: { 
            $gte: yesterday, 
            $lt: today 
          } 
        } 
      },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    const yesterdayRevenue = yesterdayRevenueData.length > 0 ? yesterdayRevenueData[0].total : 0;
    const todayRevenueTrend = calculatePercentChange(todayRevenue, yesterdayRevenue);
    
    // Get top 10 products
    const topProducts = await Product.aggregate([
      { 
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      { $unwind: "$categoryInfo" },
      {
        $project: {
          _id: 1,
          name: 1,
          sku: 1,
          category: "$categoryInfo.name",
          price: { $arrayElemAt: ["$variants.varientPrice", 0] },
          stock: { $sum: "$variants.varientquatity" },
          image: { $arrayElemAt: ["$images.url", 0] },
          sales: { $ifNull: ["$sales", 0] },
          revenue: { $multiply: [{ $ifNull: ["$sales", 0] }, { $arrayElemAt: ["$variants.varientPrice", 0] }] }
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 10 }
    ]);
    
    // Get top 10 categories
    const topCategories = await Category.aggregate([
      {
        $project: {
          _id: 1,
          name: 1,
          image: 1,
          isListed: 1,
          stock: 1,
          sales: 1,
          productsCount: { $literal: 0 }, // Will be updated later
          revenue: { $multiply: ["$sales", 1500] }, // Approximate revenue
          growth: { $literal: 0 } // Will be updated with random data for demo
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 10 }
    ]);
    
    // Update categories with product counts and random growth data
    for (let i = 0; i < topCategories.length; i++) {
      const productsCount = await Product.countDocuments({ categoryId: topCategories[i]._id });
      topCategories[i].productsCount = productsCount;
      
      // Generate random growth between -5 and +15 for demo purposes
      topCategories[i].growth = (Math.random() * 20 - 5).toFixed(1);
      
      // Set image URL if not present
      if (!topCategories[i].image) {
        topCategories[i].image = `/adminStyle/images/categories/${i + 1}.jpg`;
      }
    }
    
    // Get top 10 brands (based on product brand field)
    const topBrands = await Product.aggregate([
      { $match: { brand: { $ne: null, $ne: "" } } },
      { $group: {
          _id: "$brand",
          productsCount: { $sum: 1 },
          sales: { $sum: { $ifNull: ["$sales", 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          name: "$_id",
          productsCount: 1,
          sales: 1,
          revenue: { $multiply: ["$sales", 1500] }, // Approximate revenue
          growth: { $literal: 0 }, // Will be updated with random data
          image: { $literal: "" } // Will be updated later
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 10 }
    ]);
    
    // Update brands with random growth data and images
    for (let i = 0; i < topBrands.length; i++) {
      // Generate random growth between -3 and +15 for demo purposes
      topBrands[i].growth = (Math.random() * 18 - 3).toFixed(1);
      
      // Set image URL
      topBrands[i].image = `/adminStyle/images/brands/${i + 1}.jpg`;
    }
    
    // Get ledger entries (for demo, we'll use orders as ledger entries)
    const ledgerEntries = await Order.aggregate([
      { $sort: { orderDate: -1 } },
      { $skip: (currentPage - 1) * perPage },
      { $limit: perPage },
      {
        $project: {
          _id: 1,
          date: "$orderDate",
          transactionId: "$orderNumber",
          description: { 
            $cond: { 
              if: { $eq: ["$paymentMethod", "COD"] }, 
              then: "Cash on Delivery Order", 
              else: "Online Payment Order" 
            } 
          },
          category: { $literal: "Income" },
          credit: "$total",
          debit: { $literal: null },
          balance: { $literal: 0 } // Will be calculated below
        }
      }
    ]);
    
    // Calculate running balance for ledger entries
    let balance = 65805; // Starting balance
    for (let i = ledgerEntries.length - 1; i >= 0; i--) {
      if (ledgerEntries[i].credit) {
        balance += ledgerEntries[i].credit;
      }
      if (ledgerEntries[i].debit) {
        balance -= ledgerEntries[i].debit;
      }
      ledgerEntries[i].balance = balance;
    }
    
    // Get total count for pagination
    const totalLedgerEntries = await Order.countDocuments();
    const totalPages = Math.ceil(totalLedgerEntries / perPage);
    
    // Get pending orders count for notification badge
    const pendingOrdersCount = await Order.countDocuments({ 
      status: { $in: ["Pending", "Processing"] } 
    });
    
    // Mock notifications and messages for demo
    const notifications = [
      {
        icon: "shopping-cart",
        iconBg: "bg-primary",
        text: "New order received",
        timeAgo: "5 minutes ago",
        isRead: false
      },
      {
        icon: "user",
        iconBg: "bg-success",
        text: "New customer registered",
        timeAgo: "11 minutes ago",
        isRead: false
      },
      {
        icon: "exclamation-triangle",
        iconBg: "bg-warning",
        text: "Low stock alert: Product XYZ",
        timeAgo: "1 hour ago",
        isRead: true
      }
    ];
    
    const messages = [
      {
        _id: "msg1",
        senderName: "John Doe",
        senderAvatar: "/adminStyle/images/users/user1.jpg",
        preview: "Hello, how are you?"
      },
      {
        _id: "msg2",
        senderName: "Jane Smith",
        senderAvatar: "/adminStyle/images/users/user2.jpg",
        preview: "Order #1234 update"
      }
    ];
    
    // Prepare chart data
    const chartData = {
      sales: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        data: [65, 85, 80, 120, 150, 110, 90, 70, 85, 120, 130, 170]
      },
      customers: {
        labels: ['', '', '', '', '', '', ''],
        data: [65, 59, 80, 81, 56, 55, 70]
      },
      orders: {
        labels: ['', '', '', '', '', '', ''],
        data: [28, 48, 40, 45, 35, 25, 30]
      },
      revenue: {
        labels: ['', '', '', '', '', '', ''],
        data: [65, 75, 70, 90, 85, 80, 95]
      },
      pending: {
        labels: ['', '', '', '', '', '', ''],
        data: [25, 20, 30, 22, 17, 15, 18]
      }
    };
    
    // Compile all metrics
    const metrics = {
      totalCustomers,
      customersTrend,
      totalOrders,
      ordersTrend,
      totalRevenue,
      revenueTrend,
      pendingOrders,
      pendingOrdersTrend,
      salesProgress,
      salesProgressTrend,
      target: targetAmount,
      targetStatus: "danger", // For UI styling
      targetTrend: -5, // Example trend
      currentRevenue: totalRevenue,
      currentRevenueTrend: revenueTrend,
      revenueStatus: "success", // For UI styling
      todayRevenue,
      todayRevenueTrend,
      todayStatus: "success" // For UI styling
    };
    
    // Render dashboard with all data
    res.render("dashboard", {
      admin,
      metrics,
      topProducts,
      topCategories,
      topBrands,
      ledgerEntries,
      currentPage,
      totalPages,
      pendingOrdersCount,
      notifications,
      notificationsCount: notifications.filter(n => !n.isRead).length,
      messages,
      messagesCount: messages.length,
      chartData
    });
    
  } catch (error) {
    console.error("Dashboard error:", error);
    return res.redirect("/admin/login");
  }
};

// Logout
const logout = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Error in admin logout:", err);
        return res.redirect("/admin/errorpage");
      }

      res.redirect("/admin/login");
    });
  } catch (error) {
    console.error("Admin logout error:", error);
    res.redirect("/admin/errorpage");
  }
};

// Export report
const exportReport = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }
    
    // Get date range from query parameters
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate) 
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // In a real application, you would generate a PDF or Excel report here
    // For this example, we'll just send a success message
    res.send(`Report exported for date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
  } catch (error) {
    console.error("Export report error:", error);
    res.status(500).send("Error exporting report");
  }
};

// Add ledger entry
const addLedgerEntry = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }
    
    const { date, description, category, debit, credit, notes } = req.body;
    
    // In a real application, you would save this to a ledger collection
    // For this example, we'll just redirect back to the dashboard
    
    // Validate input
    if (!date || !description || !category) {
      return res.status(400).send("Missing required fields");
    }
    
    if ((!debit && !credit) || (debit && credit)) {
      return res.status(400).send("Please provide either debit or credit amount");
    }
    
    // Redirect back to dashboard
    res.redirect("/admin/dashboard");
    
  } catch (error) {
    console.error("Add ledger entry error:", error);
    res.status(500).send("Error adding ledger entry");
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  logout,
  exportReport,
  addLedgerEntry
};