const User = require("../../model/userSchema");
const Order = require("../../model/orderSchema");
const Product = require("../../model/productScheema");
const OrderItem = require("../../model/orderItemSchema");
const { generateSalesReport, generateExcel } = require("../../utils/reportGenerator");

const loadsales = async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const { from, to, search, page = 1 } = req.query;
    const limit = 10;
    const skip = (page - 1) * limit;

    let dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: "Delivered",
    };

    let orders = await Order.find(dateFilter)
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
      .sort({ orderDate: -1 });

    let salesData = [];

    for (const order of orders) {
      for (const item of order.order_items) {
        if (!item.productId) continue;

        // Calculate discount amount and percentage if available
        const discount = item.discount || 0;
        const discountPercentage = item.discount_percentage || 
          (discount > 0 && item.price > 0 ? Math.round((discount / item.price) * 100) : 0);

        const saleEntry = {
          buyer: order.userId ? order.userId.fullname : "Unknown",
          productName: item.product_name,
          productId: item.productId._id,
          sku: `#${item.productId._id.toString().slice(-5)}`,
          quantity: item.quantity,
          price: item.price,
          discount: discount,
          discountPercentage: discountPercentage,
          category: item.productId.categoryId
            ? item.productId.categoryId.name
            : "Uncategorized",
          total: item.total_amount,
          orderDate: order.orderDate,
          status: order.status,
          paymentMethod: order.paymentMethod,
        };

        salesData.push(saleEntry);
      }
    }

    if (search) {
      const searchLower = search.toLowerCase();
      salesData = salesData.filter(
        (item) =>
          item.buyer.toLowerCase().includes(searchLower) ||
          item.productName.toLowerCase().includes(searchLower) ||
          item.sku.toLowerCase().includes(searchLower) ||
          item.category.toLowerCase().includes(searchLower)
      );
    }

    const totalReports = salesData.length;
    const totalPages = Math.ceil(totalReports / limit);

    const totalSales = salesData.reduce(
      (sum, item) => sum + (item.total || 0),
      0
    );
    const totalItems = salesData.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueCustomers = new Set(salesData.map((item) => item.buyer)).size;
    const totalDiscounts = salesData.reduce(
      (sum, item) => sum + (item.discount || 0) * item.quantity,
      0
    );

    const paginatedSalesData = salesData.slice(skip, skip + limit);

    res.render("sales", {
      salesData: paginatedSalesData,
      totalSales,
      totalItems,
      totalDiscounts,
      uniqueCustomers,
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      searchQuery: search || "",
      currentPage: parseInt(page),
      totalPages,
      totalReports,
    });
  } catch (error) {
    console.error("Unable to load the sales page:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
const downloadSalesPDF = async (req, res) => {
  try {
    const { from, to, search } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    let dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: "Delivered",
    };

    let orders = await Order.find(dateFilter)
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
      .sort({ orderDate: -1 });

    let salesData = [];

    for (const order of orders) {
      for (const item of order.order_items) {
        if (!item.productId) continue;

        const saleEntry = {
          buyer: order.userId ? order.userId.fullname : "Unknown",
          productName: item.product_name,
          productId: item.productId._id,
          sku: `#${item.productId._id.toString().slice(-5)}`,
          quantity: item.quantity,
          price: item.price,
    
          category: item.productId.categoryId
            ? item.productId.categoryId.name
            : "Uncategorized",
          total: item.total_amount,
          orderDate: order.orderDate,
          status: order.status,
          paymentMethod: order.paymentMethod,
        };

        salesData.push(saleEntry);
      }
    }

    if (search) {
      const searchLower = search.toLowerCase();
      salesData = salesData.filter(
        (item) =>
          item.buyer.toLowerCase().includes(searchLower) ||
          item.productName.toLowerCase().includes(searchLower) ||
          item.sku.toLowerCase().includes(searchLower) ||
          item.category.toLowerCase().includes(searchLower)
      );
    }

    
    await generateSalesReport(salesData, res, {
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      title: "Delivered Orders Sales Report",
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to generate PDF" });
  }
};

const downloadSalesExcel = async (req, res) => {
  try {
    const { from, to, search } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    let dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: "Delivered",
    };

    let orders = await Order.find(dateFilter)
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
      .sort({ orderDate: -1 });

    let salesData = [];

    for (const order of orders) {
      for (const item of order.order_items) {
        if (!item.productId) continue;

        const saleEntry = {
          buyer: order.userId ? order.userId.fullname : "Unknown",
          productName: item.product_name,
          productId: item.productId._id,
          sku: `#${item.productId._id.toString().slice(-5)}`,
          quantity: item.quantity,
          price: item.price,
         
          category: item.productId.categoryId
            ? item.productId.categoryId.name
            : "Uncategorized",
          total: item.total_amount,
          orderDate: order.orderDate,
          status: order.status,
          paymentMethod: order.paymentMethod,
        };

        salesData.push(saleEntry);
      }
    }

    if (search) {
      const searchLower = search.toLowerCase();
      salesData = salesData.filter(
        (item) =>
          item.buyer.toLowerCase().includes(searchLower) ||
          item.productName.toLowerCase().includes(searchLower) ||
          item.sku.toLowerCase().includes(searchLower) ||
          item.category.toLowerCase().includes(searchLower)
      );
    }

    await generateExcel(salesData, res, {
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      title: "Delivered Orders Sales Report",
      filename: "delivered_orders_sales_report.xlsx",
    });
  } catch (error) {
    console.error("Error generating Excel:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to generate Excel" });
  }
};

module.exports = {
  loadsales,
  downloadSalesPDF,
  downloadSalesExcel,
};