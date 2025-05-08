const User = require('../../model/userSchema');
const Product = require('../../model/productScheema');
const Order = require('../../model/orderSchema');
const OrderItem = require('../../model/orderItemSchema');
const Category = require('../../model/categoryScheema');
const Ledger = require('../../model/LedgerScheema');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const bcrypt = require("bcrypt")

// Helper function to calculate percentage change
const calculatePercentageChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
};

// Helper function to format time ago
const timeAgo = (date) => {
    return moment(date).fromNow();
};

// Helper function to generate random colors for categories
function getRandomColor(seed) {
    const colors = [
        '#4f46e5', // Primary
        '#10b981', // Success
        '#f59e0b', // Warning
        '#ef4444', // Danger
        '#0ea5e9', // Info
        '#8b5cf6', // Purple
        '#ec4899', // Pink
        '#14b8a6', // Teal
        '#f97316', // Orange
        '#6366f1'  // Indigo
    ];
    
    // Use the seed string to pick a consistent color
    const index = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
}

// Dashboard controller
exports.loadDashboard = async (req, res) => {
    try {
        // Get current date ranges
        const today = moment().startOf('day');
        const yesterday = moment().subtract(1, 'days').startOf('day');
        const thisWeekStart = moment().startOf('week');
        const lastWeekStart = moment().subtract(1, 'week').startOf('week');
        const thisMonthStart = moment().startOf('month');
        const lastMonthStart = moment().subtract(1, 'month').startOf('month');

        // 1. Customer Information
        const customerCount = await User.countDocuments({ isAdmin: false });
        const customersLastMonth = await User.countDocuments({
            isAdmin: false,
            createdAt: { $gte: lastMonthStart.toDate(), $lt: thisMonthStart.toDate() }
        });
        const customerChange = calculatePercentageChange(
            customerCount - customersLastMonth,
            customersLastMonth
        );

        // 2. Order and Revenue Information
        // Current month orders and revenue
        const currentMonthOrders = await Order.find({
            createdAt: { $gte: thisMonthStart.toDate() }
        });
        const totalOrders = await Order.countDocuments();
        const ordersLastMonth = await Order.countDocuments({
            createdAt: { $gte: lastMonthStart.toDate(), $lt: thisMonthStart.toDate() }
        });
        const orderChange = calculatePercentageChange(
            currentMonthOrders.length,
            ordersLastMonth
        );

        // Calculate total revenue
        const totalRevenue = await Order.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        
        // Calculate revenue for current month
        const currentMonthRevenue = await Order.aggregate([
            { 
                $match: { 
                    status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] },
                    createdAt: { $gte: thisMonthStart.toDate() }
                } 
            },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        
        // Calculate revenue for last month
        const lastMonthRevenue = await Order.aggregate([
            { 
                $match: { 
                    status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] },
                    createdAt: { $gte: lastMonthStart.toDate(), $lt: thisMonthStart.toDate() }
                } 
            },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);

        const revenueThisMonth = currentMonthRevenue.length > 0 ? currentMonthRevenue[0].total : 0;
        const revenueLastMonth = lastMonthRevenue.length > 0 ? lastMonthRevenue[0].total : 0;
        const revenueChange = calculatePercentageChange(revenueThisMonth, revenueLastMonth);

        // 3. Product Information
        const productCount = await Product.countDocuments();
        const productsLastMonth = await Product.countDocuments({
            createdAt: { $gte: lastMonthStart.toDate(), $lt: thisMonthStart.toDate() }
        });
        const productChange = calculatePercentageChange(
            productCount - productsLastMonth,
            productsLastMonth
        );

        // 4. Category Information
        const categoryCount = await Category.countDocuments();

        // 5. Sales Overview Data (Monthly, Weekly, Daily)
        // Monthly sales data for the chart - last 12 months
        const monthlySalesData = await Order.aggregate([
            {
                $match: {
                    status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] },
                    createdAt: { $gte: moment().subtract(11, 'months').startOf('month').toDate() }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    revenue: { $sum: "$total" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Weekly sales data - last 8 weeks with proper formatting
        const weeklySalesData = await Order.aggregate([
            {
                $match: {
                    status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] },
                    createdAt: { $gte: moment().subtract(7, 'weeks').startOf('week').toDate() }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        week: { $week: "$createdAt" }
                    },
                    revenue: { $sum: "$total" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.week": 1 } }
        ]);

        // Format weekly data for better display
        const formattedWeeklySalesData = weeklySalesData.map((item, index) => {
            const weekNumber = item._id.week;
            const year = item._id.year;
            // Calculate the start date of the week for better labeling
            const weekStart = moment().year(year).week(weekNumber).startOf('week');
            return {
                _id: `${year}-W${weekNumber}`,
                revenue: item.revenue,
                count: item.count,
                label: weekStart.format('MMM DD') // Format as "Jan 01"
            };
        });

        // Daily sales data - last 7 days
        const dailySalesData = await Order.aggregate([
            {
                $match: {
                    status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] },
                    createdAt: { $gte: moment().subtract(6, 'days').startOf('day').toDate() }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: "$total" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 6. Revenue Distribution by Payment Method - ensure we categorize correctly
        const paymentMethodDistribution = await Order.aggregate([
            {
                $match: { 
                    status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] }
                }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$paymentMethod", "Wallet"] },
                            "Wallet",
                            {
                                $cond: [
                                    { $in: ["$paymentMethod", ["COD", "Cash on Delivery"]] },
                                    "Cash on Delivery",
                                    "Online Payment"
                                ]
                            }
                        ]
                    },
                    revenue: { $sum: "$total" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        // 7. Revenue distribution by order status
        const orderStatusDistribution = await Order.aggregate([
            {
                $group: {
                    _id: "$status",
                    revenue: { $sum: "$total" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        // 7. Recent Orders with Customer Information
        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate({
                path: 'userId',
                select: 'fullname email'
            })
            .populate({
                path: 'address'
            });

        // Format recent orders for display
        const formattedRecentOrders = recentOrders.map(order => ({
            _id: order._id,
            orderNumber: order.orderNumber,
            customer: {
                name: order.userId ? order.userId.fullname : 'Guest User',
                email: order.userId ? order.userId.email : 'guest@example.com'
            },
            createdAt: order.createdAt,
            totalAmount: order.total,
            status: order.status
        }));

        // 8. Top Selling Products - Fix image paths
        const topProducts = await OrderItem.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] } } },
            {
                $group: {
                    _id: "$productId",
                    soldCount: { $sum: "$quantity" },
                    revenue: { $sum: "$total_amount" },
                    productName: { $first: "$product_name" }
                }
            },
            { $sort: { soldCount: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            {
                $project: {
                    _id: 1,
                    name: "$productName",
                    soldCount: 1,
                    revenue: 1,
                    image: { $arrayElemAt: ["$productDetails.images", 0] },
                    category: { $arrayElemAt: ["$productDetails.category", 0] }
                }
            }
        ]);

        // Process product images to ensure they have proper paths - FIXED CODE
        const processedTopProducts = topProducts.map(product => {
            // Check if image exists and is a string before trying to use startsWith
            if (product.image && typeof product.image === 'string') {
                // If image doesn't start with http or /, add the proper prefix
                if (!product.image.startsWith('http') && !product.image.startsWith('/')) {
                    product.image = '/' + product.image;
                }
            } else if (product.image && Array.isArray(product.image)) {
                // If image is an array, use the first element if it exists
                product.image = product.image[0] && typeof product.image[0] === 'string' 
                    ? (product.image[0].startsWith('http') || product.image[0].startsWith('/') 
                        ? product.image[0] 
                        : '/' + product.image[0])
                    : null;
            } else {
                // Set a default image path if no valid image is found
                product.image = '/images/placeholder-product.png';
            }
            return product;
        });

        // 9. Top Categories
        const topCategories = await OrderItem.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] } } },
            {
                $lookup: {
                    from: 'products',
                    localField: 'productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: "$product" },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'product.category',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: "$category" },
            {
                $group: {
                    _id: "$category._id",
                    name: { $first: "$category.name" },
                    image: { $first: "$category.image" },
                    soldCount: { $sum: "$quantity" },
                    revenue: { $sum: "$total_amount" }
                }
            },
            { $sort: { soldCount: -1 } },
            { $limit: 10 }
        ]);

        // Process category images - FIXED CODE
        const processedTopCategories = topCategories.map(category => {
            if (category.image && typeof category.image === 'string') {
                if (!category.image.startsWith('http') && !category.image.startsWith('/')) {
                    category.image = '/' + category.image;
                }
            } else if (category.image && Array.isArray(category.image)) {
                // If image is an array, use the first element if it exists
                category.image = category.image[0] && typeof category.image[0] === 'string'
                    ? (category.image[0].startsWith('http') || category.image[0].startsWith('/')
                        ? category.image[0]
                        : '/' + category.image[0])
                    : null;
            } else {
                // Set a default image path if no valid image is found
                category.image = '/images/placeholder-category.png';
            }
            return category;
        });

        // 10. Top Brands (from product data since there's no separate brand schema)
        const topBrands = await OrderItem.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] } } },
            {
                $lookup: {
                    from: 'products',
                    localField: 'productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: "$product" },
            {
                $group: {
                    _id: "$product.brand",
                    name: { $first: "$product.brand" },
                    soldCount: { $sum: "$quantity" },
                    revenue: { $sum: "$total_amount" }
                }
            },
            { $sort: { soldCount: -1 } },
            { $limit: 10 }
        ]);

        // 11. Recent Ledger Entries
        const recentLedgerEntries = await Ledger.find()
            .sort({ date: -1 })
            .limit(5);

        // 12. Customer Activities
        const recentActivities = await Promise.all([
            // Recent orders
            Order.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate({
                    path: 'userId',
                    select: 'fullname'
                }),
            
            // Recent user registrations
            User.find({ isAdmin: false })
                .sort({ createdAt: -1 })
                .limit(5)
        ]);

        const [recentOrderActivities, recentUserActivities] = recentActivities;

        // Format activities
        const orderActivities = recentOrderActivities.map(order => ({
            type: 'order',
            icon: 'fas fa-shopping-cart',
            message: `${order.userId ? order.userId.fullname : 'A customer'} placed an order for ₹${order.total.toLocaleString('en-IN')}`,
            timeAgo: timeAgo(order.createdAt)
        }));

        const userActivities = recentUserActivities.map(user => ({
            type: 'user',
            icon: 'fas fa-user-plus',
            message: `${user.fullname} registered a new account`,
            timeAgo: timeAgo(user.createdAt)
        }));

        // Combine and sort activities
        const customerActivities = [...orderActivities, ...userActivities]
            .sort((a, b) => {
                const timeA = moment(a.timeAgo, 'from now');
                const timeB = moment(b.timeAgo, 'from now');
                return timeA - timeB;
            })
            .slice(0, 10);

        // Render the dashboard with all the data
        res.render('dashboard', {
            // Admin info
            admin: req.session.admin,
            
            // Stats
            totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
            revenueChange,
            totalOrders,
            orderChange,
            customerCount,
            customerChange,
            productCount,
            productChange,
            categoryCount,
            
            // Charts data
            monthlySalesData,
            weeklySalesData: formattedWeeklySalesData,
            dailySalesData,
            paymentMethodDistribution,
            orderStatusDistribution,
            
            // Tables data
            recentOrders: formattedRecentOrders,
            topProducts: processedTopProducts,
            topCategories: processedTopCategories,
            topBrands,
            recentLedgerEntries,
            
            // Activity data
            customerActivities,

            // Helper functions
            getRandomColor,
            moment
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).render('error', {
            message: 'Failed to load dashboard data',
            error: error.message
        });
    }
};

// Login controller
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
    req.session.admin = null;
    res.redirect('/admin/login');
};

// Chart data API for AJAX requests
exports.getChartDataAPI = async (req, res) => {
    try {
        const period = req.query.period || 'monthly';
        const type = req.query.type || 'revenue';
        
        let startDate, groupBy, dateFormat;
        
        switch (period) {
            case 'yearly':
                startDate = moment().subtract(5, 'years').startOf('year');
                groupBy = { $year: "$createdAt" };
                dateFormat = "%Y";
                break;
            case 'monthly':
                startDate = moment().subtract(11, 'months').startOf('month');
                groupBy = { 
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" }
                };
                dateFormat = "%Y-%m";
                break;
            case 'weekly':
                startDate = moment().subtract(8, 'weeks').startOf('week');
                groupBy = { $week: "$createdAt" };
                dateFormat = "%U";
                break;
            case 'daily':
                startDate = moment().subtract(6, 'days').startOf('day');
                groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
                dateFormat = "%Y-%m-%d";
                break;
            default:
                startDate = moment().subtract(11, 'months').startOf('month');
                groupBy = { 
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" }
                };
                dateFormat = "%Y-%m";
        }
        
        let data;
        
        if (type === 'revenue') {
            data = await Order.aggregate([
                {
                    $match: {
                        status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] },
                        createdAt: { $gte: startDate.toDate() }
                    }
                },
                {
                    $group: {
                        _id: period === 'monthly' ? { 
                            year: { $year: "$createdAt" },
                            month: { $month: "$createdAt" }
                        } : { $dateToString: { format: dateFormat, date: "$createdAt" } },
                        value: { $sum: "$total" }
                    }
                },
                { $sort: { "_id": 1 } }
            ]);
        } else if (type === 'orders') {
            data = await Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate.toDate() }
                    }
                },
                {
                    $group: {
                        _id: period === 'monthly' ? { 
                            year: { $year: "$createdAt" },
                            month: { $month: "$createdAt" }
                        } : { $dateToString: { format: dateFormat, date: "$createdAt" } },
                        value: { $sum: 1 }
                    }
                },
                { $sort: { "_id": 1 } }
            ]);
        } else if (type === 'customers') {
            data = await User.aggregate([
                {
                    $match: {
                        isAdmin: false,
                        createdAt: { $gte: startDate.toDate() }
                    }
                },
                {
                    $group: {
                        _id: period === 'monthly' ? { 
                            year: { $year: "$createdAt" },
                            month: { $month: "$createdAt" }
                        } : { $dateToString: { format: dateFormat, date: "$createdAt" } },
                        value: { $sum: 1 }
                    }
                },
                { $sort: { "_id": 1 } }
            ]);
        }
        
        // Format the data for the chart
        let formattedData = [];
        
        if (period === 'monthly') {
            formattedData = data.map(item => {
                const date = new Date(item._id.year, item._id.month - 1);
                return {
                    label: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                    value: item.value
                };
            });
        } else {
            formattedData = data.map(item => {
                let label = item._id;
                
                if (period === 'daily') {
                    const date = new Date(item._id);
                    label = date.toLocaleString('default', { weekday: 'short', day: 'numeric' });
                } else if (period === 'weekly') {
                    label = `Week ${item._id}`;
                } else if (period === 'yearly') {
                    label = item._id.toString();
                }
                
                return {
                    label,
                    value: item.value
                };
            });
        }
        
        res.json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chart data',
            error: error.message
        });
    }
};

// Export dashboard report
exports.exportReport = async (req, res) => {
    try {
        const format = req.query.format || 'pdf';
        const period = req.query.period || 'monthly';
        
        // Get data for the report
        const totalRevenue = await Order.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        
        const totalOrders = await Order.countDocuments();
        const customerCount = await User.countDocuments({ isAdmin: false });
        
        // Get top products
        const topProducts = await OrderItem.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] } } },
            {
                $group: {
                    _id: "$productId",
                    soldCount: { $sum: "$quantity" },
                    revenue: { $sum: "$total_amount" },
                    productName: { $first: "$product_name" }
                }
            },
            { $sort: { soldCount: -1 } },
            { $limit: 10 }
        ]);
        
        // Get sales data based on period
        let startDate, groupBy, dateFormat;
        
        switch (period) {
            case 'yearly':
                startDate = moment().subtract(5, 'years').startOf('year');
                groupBy = { $year: "$createdAt" };
                dateFormat = "%Y";
                break;
            case 'monthly':
                startDate = moment().subtract(11, 'months').startOf('month');
                groupBy = { 
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" }
                };
                dateFormat = "%Y-%m";
                break;
            case 'weekly':
                startDate = moment().subtract(8, 'weeks').startOf('week');
                groupBy = { $week: "$createdAt" };
                dateFormat = "%U";
                break;
            case 'daily':
                startDate = moment().subtract(6, 'days').startOf('day');
                groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
                dateFormat = "%Y-%m-%d";
                break;
            default:
                startDate = moment().subtract(11, 'months').startOf('month');
                groupBy = { 
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" }
                };
                dateFormat = "%Y-%m";
        }
        
        const salesData = await Order.aggregate([
            {
                $match: {
                    status: { $nin: ['Cancelled', 'Return Requested', 'Return Approved', 'Returned'] },
                    createdAt: { $gte: startDate.toDate() }
                }
            },
            {
                $group: {
                    _id: period === 'monthly' ? { 
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    } : { $dateToString: { format: dateFormat, date: "$createdAt" } },
                    revenue: { $sum: "$total" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);
        
        // Format sales data
        let formattedSalesData = [];
        
        if (period === 'monthly') {
            formattedSalesData = salesData.map(item => {
                const date = new Date(item._id.year, item._id.month - 1);
                return {
                    period: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                    revenue: item.revenue,
                    orders: item.count
                };
            });
        } else {
            formattedSalesData = salesData.map(item => {
                let periodLabel = item._id;
                
                if (period === 'daily') {
                    const date = new Date(item._id);
                    periodLabel = date.toLocaleString('default', { weekday: 'short', day: 'numeric' });
                } else if (period === 'weekly') {
                    periodLabel = `Week ${item._id}`;
                } else if (period === 'yearly') {
                    periodLabel = item._id.toString();
                }
                
                return {
                    period: periodLabel,
                    revenue: item.revenue,
                    orders: item.count
                };
            });
        }
        
        if (format === 'pdf') {
            // Generate PDF report
            const doc = new PDFDocument({ margin: 50 });
            
            // Set response headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.pdf`);
            
            // Pipe the PDF to the response
            doc.pipe(res);
            
            // Add content to the PDF
            doc.fontSize(25).text('Sales Report', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, { align: 'center' });
            doc.moveDown();
            
            // Add summary
            doc.fontSize(16).text('Summary', { underline: true });
            doc.moveDown();
            
            doc.fontSize(12).text(`Total Revenue: ₹${totalRevenue.length > 0 ? totalRevenue[0].total.toLocaleString('en-IN') : 0}`);
            doc.fontSize(12).text(`Total Orders: ${totalOrders.toLocaleString('en-IN')}`);
            doc.fontSize(12).text(`Total Customers: ${customerCount.toLocaleString('en-IN')}`);
            doc.moveDown();
            
            // Add top products
            doc.fontSize(16).text('Top Products', { underline: true });
            doc.moveDown();
            
            // Create a table for top products
            let yPos = doc.y;
            const productTableTop = yPos;
            const productColWidths = [40, 200, 100, 100];
            
            // Table headers
            doc.fontSize(10).text('#', doc.x, yPos);
            doc.fontSize(10).text('Product', doc.x + productColWidths[0], yPos);
            doc.fontSize(10).text('Units Sold', doc.x + productColWidths[0] + productColWidths[1], yPos);
            doc.fontSize(10).text('Revenue', doc.x + productColWidths[0] + productColWidths[1] + productColWidths[2], yPos);
            
            // Draw header line
            yPos += 15;
            doc.moveTo(doc.x, yPos).lineTo(doc.x + productColWidths.reduce((a, b) => a + b, 0), yPos).stroke();
            yPos += 10;
            
            // Table rows
            topProducts.forEach((product, index) => {
                // Check if we need a new page
                if (yPos > doc.page.height - 100) {
                    doc.addPage();
                    yPos = doc.y;
                }
                
                doc.fontSize(10).text((index + 1).toString(), doc.x, yPos);
                doc.fontSize(10).text(product.productName || 'Unknown Product', doc.x + productColWidths[0], yPos);
                doc.fontSize(10).text(product.soldCount.toString(), doc.x + productColWidths[0] + productColWidths[1], yPos);
                doc.fontSize(10).text(`₹${product.revenue.toLocaleString('en-IN')}`, doc.x + productColWidths[0] + productColWidths[1] + productColWidths[2], yPos);
                
                yPos += 20;
            });
            
            // Draw bottom line
            doc.moveTo(doc.x, yPos).lineTo(doc.x + productColWidths.reduce((a, b) => a + b, 0), yPos).stroke();
            
            // Add sales data
            doc.addPage();
            doc.fontSize(16).text('Sales Data', { underline: true });
            doc.moveDown();
            
            // Create a table for sales data
            yPos = doc.y;
            const salesColWidths = [150, 150, 150];
            
            // Table headers
            doc.fontSize(10).text('Period', doc.x, yPos);
            doc.fontSize(10).text('Revenue', doc.x + salesColWidths[0], yPos);
            doc.fontSize(10).text('Orders', doc.x + salesColWidths[0] + salesColWidths[1], yPos);
            
            // Draw header line
            yPos += 15;
            doc.moveTo(doc.x, yPos).lineTo(doc.x + salesColWidths.reduce((a, b) => a + b, 0), yPos).stroke();
            yPos += 10;
            
            // Table rows
            formattedSalesData.forEach((data) => {
                // Check if we need a new page
                if (yPos > doc.page.height - 100) {
                    doc.addPage();
                    yPos = doc.y;
                }
                
                doc.fontSize(10).text(data.period, doc.x, yPos);
                doc.fontSize(10).text(`₹${data.revenue.toLocaleString('en-IN')}`, doc.x + salesColWidths[0], yPos);
                doc.fontSize(10).text(data.orders.toString(), doc.x + salesColWidths[0] + salesColWidths[1], yPos);
                
                yPos += 20;
            });
            
            // Draw bottom line
            doc.moveTo(doc.x, yPos).lineTo(doc.x + salesColWidths.reduce((a, b) => a + b, 0), yPos).stroke();
            
            // Finalize the PDF
            doc.end();
        } else if (format === 'excel') {
            // Generate Excel report
            const workbook = new ExcelJS.Workbook();
            
            // Add Summary worksheet
            const summarySheet = workbook.addWorksheet('Summary');
            
            // Add title and date
            summarySheet.mergeCells('A1:D1');
            summarySheet.getCell('A1').value = 'Sales Report';
            summarySheet.getCell('A1').font = { size: 16, bold: true };
            summarySheet.getCell('A1').alignment = { horizontal: 'center' };
            
            summarySheet.mergeCells('A2:D2');
            summarySheet.getCell('A2').value = `Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`;
            summarySheet.getCell('A2').alignment = { horizontal: 'center' };
            
            // Add summary data
            summarySheet.addRow([]);
            summarySheet.addRow(['Total Revenue', `₹${totalRevenue.length > 0 ? totalRevenue[0].total.toLocaleString('en-IN') : 0}`]);
            summarySheet.addRow(['Total Orders', totalOrders.toLocaleString('en-IN')]);
            summarySheet.addRow(['Total Customers', customerCount.toLocaleString('en-IN')]);
            
            // Add Top Products worksheet
            const productsSheet = workbook.addWorksheet('Top Products');
            
            // Add headers
            productsSheet.columns = [
                { header: '#', key: 'index', width: 5 },
                { header: 'Product', key: 'product', width: 30 },
                { header: 'Units Sold', key: 'sold', width: 15 },
                { header: 'Revenue', key: 'revenue', width: 20 }
            ];
            
            // Add data
            topProducts.forEach((product, index) => {
                productsSheet.addRow({
                    index: index + 1,
                    product: product.productName || 'Unknown Product',
                    sold: product.soldCount,
                    revenue: `₹${product.revenue.toLocaleString('en-IN')}`
                });
            });
            
            // Add Sales Data worksheet
            const salesSheet = workbook.addWorksheet('Sales Data');
            
            // Add headers
            salesSheet.columns = [
                { header: 'Period', key: 'period', width: 20 },
                { header: 'Revenue', key: 'revenue', width: 20 },
                { header: 'Orders', key: 'orders', width: 15 }
            ];
            
            // Add data
            formattedSalesData.forEach((data) => {
                salesSheet.addRow({
                    period: data.period,
                    revenue: `₹${data.revenue.toLocaleString('en-IN')}`,
                    orders: data.orders
                });
            });
            
            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.xlsx`);
            
            // Write to response
            await workbook.xlsx.write(res);
            res.end();
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid format specified. Use pdf or excel.'
            });
        }
    } catch (error) {
        console.error('Error exporting report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export report',
            error: error.message
        });
    }
};

// Ledger management
exports.addLedgerEntry = async (req, res) => {
    try {
        const { date, description, category, debit, credit, notes } = req.body;
        
        // Calculate current balance
        const lastEntry = await Ledger.findOne().sort({ createdAt: -1 });
        const previousBalance = lastEntry ? lastEntry.balance : 0;
        
        const debitAmount = parseFloat(debit) || 0;
        const creditAmount = parseFloat(credit) || 0;
        
        // Calculate new balance
        const balance = previousBalance + creditAmount - debitAmount;
        
        // Generate transaction ID
        const transactionId = `TXN${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        
        // Create new ledger entry
        const newEntry = new Ledger({
            date: date || new Date(),
            transactionId,
            description,
            category,
            debit: debitAmount,
            credit: creditAmount,
            balance,
            notes
        });
        
        await newEntry.save();
        
        req.flash('success_msg', 'Ledger entry added successfully');
        res.redirect('/admin');
    } catch (error) {
        console.error('Error adding ledger entry:', error);
        req.flash('error_msg', 'Failed to add ledger entry');
        res.redirect('/admin');
    }
};

exports.getLedgerEntry = async (req, res) => {
    try {
        const entry = await Ledger.findById(req.params.id);
        
        if (!entry) {
            return res.status(404).json({
                success: false,
                message: 'Ledger entry not found'
            });
        }
        
        res.json({
            success: true,
            data: entry
        });
    } catch (error) {
        console.error('Error getting ledger entry:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get ledger entry',
            error: error.message
        });
    }
};

exports.editLedgerEntry = async (req, res) => {
    try {
        const { id, date, description, category, debit, credit, notes } = req.body;
        
        const entry = await Ledger.findById(id);
        
        if (!entry) {
            req.flash('error_msg', 'Ledger entry not found');
            return res.redirect('/admin');
        }
        
        // Update entry fields
        entry.date = date || entry.date;
        entry.description = description || entry.description;
        entry.category = category || entry.category;
        entry.debit = parseFloat(debit) || entry.debit;
        entry.credit = parseFloat(credit) || entry.credit;
        entry.notes = notes || entry.notes;
        
        await entry.save();
        
        // Recalculate balances for all subsequent entries
        const subsequentEntries = await Ledger.find({
            createdAt: { $gt: entry.createdAt }
        }).sort({ createdAt: 1 });
        
        let currentBalance = entry.balance;
        
        for (const subEntry of subsequentEntries) {
            currentBalance = currentBalance + subEntry.credit - subEntry.debit;
            subEntry.balance = currentBalance;
            await subEntry.save();
        }
        
        req.flash('success_msg', 'Ledger entry updated successfully');
        res.redirect('/admin');
    } catch (error) {
        console.error('Error editing ledger entry:', error);
        req.flash('error_msg', 'Failed to update ledger entry');
        res.redirect('/admin');
    }
};

exports.deleteLedgerEntry = async (req, res) => {
    try {
        const entry = await Ledger.findById(req.params.id);
        
        if (!entry) {
            req.flash('error_msg', 'Ledger entry not found');
            return res.redirect('/admin');
        }
        
        await entry.remove();
        
        // Recalculate balances for all subsequent entries
        const subsequentEntries = await Ledger.find({
            createdAt: { $gt: entry.createdAt }
        }).sort({ createdAt: 1 });
        
        let currentBalance = entry.balance - entry.credit + entry.debit;
        
        for (const subEntry of subsequentEntries) {
            currentBalance = currentBalance + subEntry.credit - subEntry.debit;
            subEntry.balance = currentBalance;
            await subEntry.save();
        }
        
        req.flash('success_msg', 'Ledger entry deleted successfully');
        res.redirect('/admin');
    } catch (error) {
        console.error('Error deleting ledger entry:', error);
        req.flash('error_msg', 'Failed to delete ledger entry');
        res.redirect('/admin');
    }
};

exports.exportLedger = async (req, res) => {
    try {
        const format = req.query.format || 'pdf';
        const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
        const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
        
        // Build query
        const query = {};
        
        if (startDate && endDate) {
            query.date = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            query.date = { $gte: startDate };
        } else if (endDate) {
            query.date = { $lte: endDate };
        }
        
        // Get ledger entries
        const entries = await Ledger.find(query).sort({ date: 1 });
        
        if (format === 'pdf') {
            // Generate PDF report
            const doc = new PDFDocument({ margin: 50 });
            
            // Set response headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=ledger-report-${moment().format('YYYY-MM-DD')}.pdf`);
            
            // Pipe the PDF to the response
            doc.pipe(res);
            
            // Add content to the PDF
            doc.fontSize(25).text('Ledger Report', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, { align: 'center' });
            doc.moveDown();
            
            if (startDate || endDate) {
                let dateRange = 'Date Range: ';
                if (startDate) {
                    dateRange += `From ${moment(startDate).format('YYYY-MM-DD')} `;
                }
                if (endDate) {
                    dateRange += `To ${moment(endDate).format('YYYY-MM-DD')}`;
                }
                doc.fontSize(12).text(dateRange, { align: 'center' });
                doc.moveDown();
            }
            
            // Create a table for ledger entries
            let yPos = doc.y;
            const ledgerColWidths = [80, 100, 100, 80, 80, 80];
            
            // Table headers
            doc.fontSize(10).text('Date', doc.x, yPos);
            doc.fontSize(10).text('Transaction ID', doc.x + ledgerColWidths[0], yPos);
            doc.fontSize(10).text('Description', doc.x + ledgerColWidths[0] + ledgerColWidths[1], yPos);
            doc.fontSize(10).text('Debit', doc.x + ledgerColWidths[0] + ledgerColWidths[1] + ledgerColWidths[2], yPos);
            doc.fontSize(10).text('Credit', doc.x + ledgerColWidths[0] + ledgerColWidths[1] + ledgerColWidths[2] + ledgerColWidths[3], yPos);
            doc.fontSize(10).text('Balance', doc.x + ledgerColWidths[0] + ledgerColWidths[1] + ledgerColWidths[2] + ledgerColWidths[3] + ledgerColWidths[4], yPos);
            
            // Draw header line
            yPos += 15;
            doc.moveTo(doc.x, yPos).lineTo(doc.x + ledgerColWidths.reduce((a, b) => a + b, 0), yPos).stroke();
            yPos += 10;
            
            // Table rows
            entries.forEach((entry) => {
                // Check if we need a new page
                if (yPos > doc.page.height - 100) {
                    doc.addPage();
                    yPos = doc.y;
                }
                
                doc.fontSize(10).text(moment(entry.date).format('YYYY-MM-DD'), doc.x, yPos);
                doc.fontSize(10).text(entry.transactionId, doc.x + ledgerColWidths[0], yPos);
                doc.fontSize(10).text(entry.description, doc.x + ledgerColWidths[0] + ledgerColWidths[1], yPos, { width: ledgerColWidths[2] - 10 });
                doc.fontSize(10).text(`₹${entry.debit.toLocaleString('en-IN')}`, doc.x + ledgerColWidths[0] + ledgerColWidths[1] + ledgerColWidths[2], yPos);
                doc.fontSize(10).text(`₹${entry.credit.toLocaleString('en-IN')}`, doc.x + ledgerColWidths[0] + ledgerColWidths[1] + ledgerColWidths[2] + ledgerColWidths[3], yPos);
                doc.fontSize(10).text(`₹${entry.balance.toLocaleString('en-IN')}`, doc.x + ledgerColWidths[0] + ledgerColWidths[1] + ledgerColWidths[2] + ledgerColWidths[3] + ledgerColWidths[4], yPos);
                
                yPos += 20;
            });
            
            // Draw bottom line
            doc.moveTo(doc.x, yPos).lineTo(doc.x + ledgerColWidths.reduce((a, b) => a + b, 0), yPos).stroke();
            
            // Add summary
            yPos += 20;
            const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
            const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);
            const finalBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0;
            
            doc.fontSize(12).text(`Total Debit: ₹${totalDebit.toLocaleString('en-IN')}`, doc.x, yPos);
            yPos += 20;
            doc.fontSize(12).text(`Total Credit: ₹${totalCredit.toLocaleString('en-IN')}`, doc.x, yPos);
            yPos += 20;
            doc.fontSize(12).text(`Final Balance: ₹${finalBalance.toLocaleString('en-IN')}`, doc.x, yPos);
            
            // Finalize the PDF
            doc.end();
        } else if (format === 'excel') {
            // Generate Excel report
            const workbook = new ExcelJS.Workbook();
            
            // Add Ledger worksheet
            const ledgerSheet = workbook.addWorksheet('Ledger');
            
            // Add title and date
            ledgerSheet.mergeCells('A1:F1');
            ledgerSheet.getCell('A1').value = 'Ledger Report';
            ledgerSheet.getCell('A1').font = { size: 16, bold: true };
            ledgerSheet.getCell('A1').alignment = { horizontal: 'center' };
            
            ledgerSheet.mergeCells('A2:F2');
            ledgerSheet.getCell('A2').value = `Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`;
            ledgerSheet.getCell('A2').alignment = { horizontal: 'center' };
            
            if (startDate || endDate) {
                ledgerSheet.mergeCells('A3:F3');
                let dateRange = 'Date Range: ';
                if (startDate) {
                    dateRange += `From ${moment(startDate).format('YYYY-MM-DD')} `;
                }
                if (endDate) {
                    dateRange += `To ${moment(endDate).format('YYYY-MM-DD')}`;
                }
                ledgerSheet.getCell('A3').value = dateRange;
                ledgerSheet.getCell('A3').alignment = { horizontal: 'center' };
            }
            
            // Add headers
            const headerRow = ledgerSheet.addRow(['Date', 'Transaction ID', 'Description', 'Debit', 'Credit', 'Balance']);
            headerRow.font = { bold: true };
            
            // Add data
            entries.forEach((entry) => {
                ledgerSheet.addRow([
                    moment(entry.date).format('YYYY-MM-DD'),
                    entry.transactionId,
                    entry.description,
                    entry.debit,
                    entry.credit,
                    entry.balance
                ]);
            });
            
            // Add summary
            ledgerSheet.addRow([]);
            const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
            const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);
            const finalBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0;
            
            ledgerSheet.addRow(['Total Debit', '', '', totalDebit, '', '']);
            ledgerSheet.addRow(['Total Credit', '', '', '', totalCredit, '']);
            ledgerSheet.addRow(['Final Balance', '', '', '', '', finalBalance]);
            
            // Format currency columns
            ledgerSheet.getColumn(4).numFmt = '₹#,##0.00';
            ledgerSheet.getColumn(5).numFmt = '₹#,##0.00';
            ledgerSheet.getColumn(6).numFmt = '₹#,##0.00';
            
            // Set column widths
            ledgerSheet.getColumn(1).width = 15;
            ledgerSheet.getColumn(2).width = 20;
            ledgerSheet.getColumn(3).width = 40;
            ledgerSheet.getColumn(4).width = 15;
            ledgerSheet.getColumn(5).width = 15;
            ledgerSheet.getColumn(6).width = 15;
            
            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=ledger-report-${moment().format('YYYY-MM-DD')}.xlsx`);
            
            // Write to response
            await workbook.xlsx.write(res);
            res.end();
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid format specified. Use pdf or excel.'
            });
        }
    } catch (error) {
        console.error('Error exporting ledger:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export ledger',
            error: error.message
        });
    }
};