const User = require("../../model/userSchema");
const Order = require("../../model/orderSchema");
const Product = require("../../model/productScheema");
const OrderItem = require("../../model/orderItemSchema");
const {
  generateSalesReport,
  generateExcel,
} = require("../../utils/reportGenerator");

const loadsales = async (req, res) => {
  try {
    console.time("sales-page-load");

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const {
      from,
      to,
      search,
      discount,
      discountType,
      page = 1,
      discountFilter,
    } = req.query;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Create date filter
    const dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: { $in: ["Delivered", "Processing", "Confirmed", "Shipped"] },
    };

    // Use lean() for better performance - returns plain JS objects instead of Mongoose documents
    // Use projection to only fetch the fields we need
    const orders = await Order.find(dateFilter)
      .select(
        "userId couponId order_items orderDate status paymentMethod couponApplied couponCode couponDiscountPercent orderNumber"
      )
      .populate({
        path: "userId",
        select: "fullname email",
        options: { lean: true },
      })
      .populate({
        path: "couponId",
        select: "coupencode couponpercent description",
        options: { lean: true },
      })
      .sort({ orderDate: -1 })
      .lean();

    console.time("populate-order-items");

    // Collect all order item IDs to fetch in a single query
    const orderItemIds = orders.reduce((ids, order) => {
      if (order.order_items && order.order_items.length > 0) {
        return [...ids, ...order.order_items];
      }
      return ids;
    }, []);

    // Fetch all order items in a single query
    const orderItems = await OrderItem.find({ _id: { $in: orderItemIds } })
      .populate({
        path: "productId",
        select: "name categoryId offer effectiveDiscount discountSource",
        populate: {
          path: "categoryId",
          select: "name",
          options: { lean: true },
        },
        options: { lean: true },
      })
      .populate({
        path: "couponId",
        select: "coupencode couponpercent description",
        options: { lean: true },
      })
      .lean();

    // Create a map for quick lookup
    const orderItemsMap = orderItems.reduce((map, item) => {
      map[item._id.toString()] = item;
      return map;
    }, {});

    // Replace order_items references with actual items
    orders.forEach((order) => {
      if (order.order_items && order.order_items.length > 0) {
        order.order_items = order.order_items
          .map((itemId) => {
            const itemIdStr = itemId.toString();
            return orderItemsMap[itemIdStr] || null;
          })
          .filter(Boolean); // Remove null items
      }
    });

    console.timeEnd("populate-order-items");
    console.time("process-sales-data");

    let salesData = [];
    let uniqueCoupons = new Set();
    let ordersWithCouponsCount = 0;
    let totalSales = 0;
    let totalItems = 0;
    let totalDiscounts = 0;
    let totalProductDiscounts = 0;
    let totalCouponDiscounts = 0;
    const uniqueCustomersSet = new Set();

    // Process orders and calculate metrics in a single pass
    for (const order of orders) {
      const orderHasCoupon = order.couponApplied || false;

      if (orderHasCoupon) {
        ordersWithCouponsCount++;
        if (order.couponCode) {
          uniqueCoupons.add(order.couponCode);
        }
      }

      if (!order.order_items || !Array.isArray(order.order_items)) {
        continue;
      }

      for (const item of order.order_items) {
        if (!item || !item.productId) {
          continue;
        }

        try {
          const productName = item.product_name || "Unknown Product";
          const productId = item.productId._id || "Unknown ID";
          const quantity = item.quantity || 0;
          const price = item.price || 0;
          const totalAmount = item.total_amount || 0;

          const discountPerUnit = item.discountPerUnit || 0;
          const discountAmount =
            item.discountAmount || discountPerUnit * quantity || 0;

          let discountPercentage = 0;
          if (item.couponDiscountPercent) {
            discountPercentage = item.couponDiscountPercent;
          } else if (discountPerUnit > 0 && price > 0) {
            discountPercentage = Math.round((discountPerUnit / price) * 100);
          }

          const productOffer = item.productId.offer || 0;
          const productEffectiveDiscount =
            item.productId.effectiveDiscount || 0;
          const productDiscountSource = item.productId.discountSource || "none";

          const couponApplied = item.couponApplied || orderHasCoupon || false;
          const couponCode = item.couponCode || order.couponCode || "";
          const couponPercent =
            item.couponDiscountPercent || order.couponDiscountPercent || 0;

          let couponDescription = "";
          if (item.couponId && item.couponId.description) {
            couponDescription = item.couponId.description;
          } else if (order.couponId && order.couponId.description) {
            couponDescription = order.couponId.description;
          }

          let category = "Uncategorized";
          if (item.productId.categoryId && item.productId.categoryId.name) {
            category = item.productId.categoryId.name;
          }

          const buyer = order.userId ? order.userId.fullname : "Unknown";
          uniqueCustomersSet.add(buyer);

          // Calculate metrics as we go
          totalSales += totalAmount;
          totalItems += quantity;
          totalDiscounts += discountAmount;

          const productDiscountAmount =
            price * (productEffectiveDiscount / 100) * quantity;
          totalProductDiscounts += productDiscountAmount;

          if (couponApplied && item.discount > 0) {
            totalCouponDiscounts += item.discount;
          } else if (couponApplied) {
            const couponDiscountAmount =
              price * (couponPercent / 100) * quantity;
            totalCouponDiscounts += couponDiscountAmount;
          }

          const saleEntry = {
            buyer,
            productName,
            productId,
            sku: `#${productId.toString().slice(-5)}`,
            quantity,
            price,
            discount: discountAmount,
            discountPercentage,
            category,
            total: totalAmount,
            orderDate: order.orderDate || new Date(),
            status: order.status || "Unknown",
            paymentMethod: order.paymentMethod || "Unknown",
            productOffer,
            productEffectiveDiscount,
            productDiscountSource,
            couponApplied,
            couponCode,
            couponPercent,
            couponDescription,
            orderNumber:
              order.orderNumber || `ORD${order._id.toString().slice(-6)}`,
          };

          salesData.push(saleEntry);
        } catch (err) {
          console.error("Error processing order item:", err);
        }
      }
    }

    console.timeEnd("process-sales-data");
    console.time("filter-data");

    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      salesData = salesData.filter(
        (item) =>
          (item.buyer && item.buyer.toLowerCase().includes(searchLower)) ||
          (item.productName &&
            item.productName.toLowerCase().includes(searchLower)) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
          (item.category &&
            item.category.toLowerCase().includes(searchLower)) ||
          (item.couponCode &&
            item.couponCode.toLowerCase().includes(searchLower)) ||
          (item.orderNumber &&
            item.orderNumber.toLowerCase().includes(searchLower))
      );
    }

    if (discountFilter) {
      if (discountFilter === "with-discount") {
        salesData = salesData.filter(
          (item) =>
            item.discount > 0 || item.productOffer > 0 || item.couponApplied
        );
      } else if (discountFilter === "no-discount") {
        salesData = salesData.filter(
          (item) =>
            item.discount === 0 &&
            item.productOffer === 0 &&
            !item.couponApplied
        );
      } else if (discountFilter === "coupon-only") {
        salesData = salesData.filter((item) => item.couponApplied);
      } else if (discountFilter === "product-offer-only") {
        salesData = salesData.filter((item) => item.productOffer > 0);
      }
    }

    console.timeEnd("filter-data");

    const uniqueCustomers = uniqueCustomersSet.size;
    const ordersWithCoupons = salesData.filter(
      (item) => item.couponApplied
    ).length;
    const couponUsageCount = uniqueCoupons.size;

    const totalReports = salesData.length;
    const totalPages = Math.ceil(totalReports / limit);
    const paginatedSalesData = salesData.slice(skip, skip + limit);

    console.timeEnd("sales-page-load");

    res.render("sales", {
      salesData: paginatedSalesData,
      totalSales: totalSales || 0,
      totalItems: totalItems || 0,
      totalDiscounts: totalDiscounts || 0,
      totalProductDiscounts: totalProductDiscounts || 0,
      totalCouponDiscounts: totalCouponDiscounts || 0,
      uniqueCustomers: uniqueCustomers || 0,
      ordersWithCoupons: ordersWithCoupons || 0,
      couponUsageCount: couponUsageCount || 0,
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      searchQuery: search || "",
      currentPage: Number.parseInt(page) || 1,
      totalPages: totalPages || 1,
      totalReports: totalReports || 0,
      discountFilter: discountFilter || "",
    });
  } catch (error) {
    console.error("Unable to load the sales page:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};


const downloadSalesPDF = async (req, res) => {
  try {
    console.time("pdf-generation");
    const { from, to, search, discountFilter } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Create date filter
    const dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: { $in: ["Delivered", "Processing", "Confirmed", "Shipped"] },
    };

    // Use lean() for better performance - returns plain JS objects instead of Mongoose documents
    // Use projection to only fetch the fields we need
    const orders = await Order.find(dateFilter)
      .select('userId couponId order_items orderDate status paymentMethod couponApplied couponCode couponDiscountPercent orderNumber')
      .populate({
        path: "userId",
        select: "fullname email",
        options: { lean: true }
      })
      .populate({
        path: "couponId",
        select: "coupencode couponpercent description",
        options: { lean: true }
      })
      .sort({ orderDate: -1 })
      .lean();

    // Collect all order item IDs to fetch in a single query
    const orderItemIds = orders.reduce((ids, order) => {
      if (order.order_items && order.order_items.length > 0) {
        return [...ids, ...order.order_items];
      }
      return ids;
    }, []);

    // Fetch all order items in a single query
    const orderItems = await OrderItem.find({ _id: { $in: orderItemIds } })
      .populate({
        path: "productId",
        select: "name categoryId offer effectiveDiscount discountSource",
        populate: {
          path: "categoryId",
          select: "name",
          options: { lean: true }
        },
        options: { lean: true }
      })
      .populate({
        path: "couponId",
        select: "coupencode couponpercent description",
        options: { lean: true }
      })
      .lean();

    // Create a map for quick lookup
    const orderItemsMap = orderItems.reduce((map, item) => {
      map[item._id.toString()] = item;
      return map;
    }, {});

    // Replace order_items references with actual items
    orders.forEach(order => {
      if (order.order_items && order.order_items.length > 0) {
        order.order_items = order.order_items.map(itemId => {
          const itemIdStr = itemId.toString();
          return orderItemsMap[itemIdStr] || null;
        }).filter(Boolean); // Remove null items
      }
    });

    let salesData = [];
    let uniqueCoupons = new Set();
    let ordersWithCouponsCount = 0;
    let totalSales = 0;
    let totalItems = 0;
    let totalDiscounts = 0;
    let totalProductDiscounts = 0;
    let totalCouponDiscounts = 0;
    const uniqueCustomersSet = new Set();
    const productOffersMap = new Map(); // Track individual product offers

    // Process orders and calculate metrics in a single pass
    for (const order of orders) {
      const orderHasCoupon = order.couponApplied || false;
      
      if (orderHasCoupon) {
        ordersWithCouponsCount++;
        if (order.couponCode) {
          uniqueCoupons.add(order.couponCode);
        }
      }

      if (!order.order_items || !Array.isArray(order.order_items)) {
        continue;
      }

      for (const item of order.order_items) {
        if (!item || !item.productId) {
          continue;
        }

        try {
          const productName = item.product_name || "Unknown Product";
          const productId = item.productId._id || "Unknown ID";
          const quantity = item.quantity || 0;
          const price = item.price || 0;
          const totalAmount = item.total_amount || 0;

          const discountPerUnit = item.discountPerUnit || 0;
          const discountAmount = item.discountAmount || discountPerUnit * quantity || 0;

          let discountPercentage = 0;
          if (item.couponDiscountPercent) {
            discountPercentage = item.couponDiscountPercent;
          } else if (discountPerUnit > 0 && price > 0) {
            discountPercentage = Math.round((discountPerUnit / price) * 100);
          }

          const productOffer = item.productId.offer || 0;
          const productEffectiveDiscount = item.productId.effectiveDiscount || 0;
          const productDiscountSource = item.productId.discountSource || "none";

          // Track individual product offers
          if (productOffer > 0) {
            const offerKey = `${productId}-${productOffer}`;
            if (!productOffersMap.has(offerKey)) {
              productOffersMap.set(offerKey, {
                productId,
                productName,
                offer: productOffer,
                count: 0,
                totalValue: 0
              });
            }
            const offerInfo = productOffersMap.get(offerKey);
            offerInfo.count += quantity;
            offerInfo.totalValue += (price * (productOffer / 100) * quantity);
          }

          const couponApplied = item.couponApplied || orderHasCoupon || false;
          const couponCode = item.couponCode || order.couponCode || "";
          const couponPercent = item.couponDiscountPercent || order.couponDiscountPercent || 0;

          let couponDescription = "";
          if (item.couponId && item.couponId.description) {
            couponDescription = item.couponId.description;
          } else if (order.couponId && order.couponId.description) {
            couponDescription = order.couponId.description;
          }

          let category = "Uncategorized";
          if (item.productId.categoryId && item.productId.categoryId.name) {
            category = item.productId.categoryId.name;
          }

          const buyer = order.userId ? order.userId.fullname : "Unknown";
          uniqueCustomersSet.add(buyer);

          // Calculate metrics as we go
          totalSales += totalAmount;
          totalItems += quantity;
          totalDiscounts += discountAmount;

          const productDiscountAmount = (price * (productEffectiveDiscount / 100)) * quantity;
          totalProductDiscounts += productDiscountAmount;

          if (couponApplied && item.discount > 0) {
            totalCouponDiscounts += item.discount;
          } else if (couponApplied) {
            const couponDiscountAmount = (price * (couponPercent / 100)) * quantity;
            totalCouponDiscounts += couponDiscountAmount;
          }

          const saleEntry = {
            buyer,
            productName,
            productId,
            sku: `#${productId.toString().slice(-5)}`,
            quantity,
            price,
            discount: discountAmount,
            discountPercentage,
            category,
            total: totalAmount,
            orderDate: order.orderDate || new Date(),
            status: order.status || "Unknown",
            paymentMethod: order.paymentMethod || "Unknown",
            productOffer,
            productEffectiveDiscount,
            productDiscountSource,
            couponApplied,
            couponCode,
            couponPercent,
            couponDescription,
            orderNumber: order.orderNumber || `ORD${order._id.toString().slice(-6)}`,
          };

          salesData.push(saleEntry);
        } catch (err) {
          console.error("Error processing order item:", err);
        }
      }
    }

    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      salesData = salesData.filter(
        (item) =>
          (item.buyer && item.buyer.toLowerCase().includes(searchLower)) ||
          (item.productName && item.productName.toLowerCase().includes(searchLower)) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
          (item.category && item.category.toLowerCase().includes(searchLower)) ||
          (item.couponCode && item.couponCode.toLowerCase().includes(searchLower)) ||
          (item.orderNumber && item.orderNumber.toLowerCase().includes(searchLower))
      );
    }

    if (discountFilter) {
      if (discountFilter === "with-discount") {
        salesData = salesData.filter(
          (item) => item.discount > 0 || item.productOffer > 0 || item.couponApplied
        );
      } else if (discountFilter === "no-discount") {
        salesData = salesData.filter(
          (item) => item.discount === 0 && item.productOffer === 0 && !item.couponApplied
        );
      } else if (discountFilter === "coupon-only") {
        salesData = salesData.filter((item) => item.couponApplied);
      } else if (discountFilter === "product-offer-only") {
        salesData = salesData.filter((item) => item.productOffer > 0);
      }
    }

    // Add product offers data to the options
    const productOffers = Array.from(productOffersMap.values());

    console.timeEnd("pdf-generation");
    await generateSalesReport(salesData, res, {
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      title: "Sales Report",
      productOffers: productOffers // Pass product offers data to the report generator
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to generate PDF" });
  }
};

// Optimized Excel download function
const downloadSalesExcel = async (req, res) => {
  try {
    console.time("excel-generation");
    const { from, to, search, discountFilter } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Create date filter
    const dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: { $in: ["Delivered", "Processing", "Confirmed", "Shipped"] },
    };

    // Use lean() for better performance - returns plain JS objects instead of Mongoose documents
    // Use projection to only fetch the fields we need
    const orders = await Order.find(dateFilter)
      .select('userId couponId order_items orderDate status paymentMethod couponApplied couponCode couponDiscountPercent orderNumber')
      .populate({
        path: "userId",
        select: "fullname email",
        options: { lean: true }
      })
      .populate({
        path: "couponId",
        select: "coupencode couponpercent description",
        options: { lean: true }
      })
      .sort({ orderDate: -1 })
      .lean();

    // Collect all order item IDs to fetch in a single query
    const orderItemIds = orders.reduce((ids, order) => {
      if (order.order_items && order.order_items.length > 0) {
        return [...ids, ...order.order_items];
      }
      return ids;
    }, []);

    // Fetch all order items in a single query
    const orderItems = await OrderItem.find({ _id: { $in: orderItemIds } })
      .populate({
        path: "productId",
        select: "name categoryId offer effectiveDiscount discountSource",
        populate: {
          path: "categoryId",
          select: "name",
          options: { lean: true }
        },
        options: { lean: true }
      })
      .populate({
        path: "couponId",
        select: "coupencode couponpercent description",
        options: { lean: true }
      })
      .lean();

    // Create a map for quick lookup
    const orderItemsMap = orderItems.reduce((map, item) => {
      map[item._id.toString()] = item;
      return map;
    }, {});

    // Replace order_items references with actual items
    orders.forEach(order => {
      if (order.order_items && order.order_items.length > 0) {
        order.order_items = order.order_items.map(itemId => {
          const itemIdStr = itemId.toString();
          return orderItemsMap[itemIdStr] || null;
        }).filter(Boolean); // Remove null items
      }
    });

    let salesData = [];
    const productOffersMap = new Map(); // Track individual product offers

    // Process orders and calculate metrics in a single pass
    for (const order of orders) {
      const orderHasCoupon = order.couponApplied || false;

      if (!order.order_items || !Array.isArray(order.order_items)) {
        continue;
      }

      for (const item of order.order_items) {
        if (!item || !item.productId) {
          continue;
        }

        try {
          const productName = item.product_name || "Unknown Product";
          const productId = item.productId._id || "Unknown ID";
          const quantity = item.quantity || 0;
          const price = item.price || 0;
          const totalAmount = item.total_amount || 0;

          const discountPerUnit = item.discountPerUnit || 0;
          const discountAmount = item.discountAmount || discountPerUnit * quantity || 0;

          let discountPercentage = 0;
          if (item.couponDiscountPercent) {
            discountPercentage = item.couponDiscountPercent;
          } else if (discountPerUnit > 0 && price > 0) {
            discountPercentage = Math.round((discountPerUnit / price) * 100);
          }

          const productOffer = item.productId.offer || 0;
          const productEffectiveDiscount = item.productId.effectiveDiscount || 0;
          const productDiscountSource = item.productId.discountSource || "none";

          // Track individual product offers
          if (productOffer > 0) {
            const offerKey = `${productId}-${productOffer}`;
            if (!productOffersMap.has(offerKey)) {
              productOffersMap.set(offerKey, {
                productId,
                productName,
                offer: productOffer,
                count: 0,
                totalValue: 0
              });
            }
            const offerInfo = productOffersMap.get(offerKey);
            offerInfo.count += quantity;
            offerInfo.totalValue += (price * (productOffer / 100) * quantity);
          }

          const couponApplied = item.couponApplied || orderHasCoupon || false;
          const couponCode = item.couponCode || order.couponCode || "";
          const couponPercent = item.couponDiscountPercent || order.couponDiscountPercent || 0;

          let couponDescription = "";
          if (item.couponId && item.couponId.description) {
            couponDescription = item.couponId.description;
          } else if (order.couponId && order.couponId.description) {
            couponDescription = order.couponId.description;
          }

          let category = "Uncategorized";
          if (item.productId.categoryId && item.productId.categoryId.name) {
            category = item.productId.categoryId.name;
          }

          const saleEntry = {
            buyer: order.userId ? order.userId.fullname : "Unknown",
            productName,
            productId,
            sku: `#${productId.toString().slice(-5)}`,
            quantity,
            price,
            discount: discountAmount,
            discountPercentage,
            category,
            total: totalAmount,
            orderDate: order.orderDate || new Date(),
            status: order.status || "Unknown",
            paymentMethod: order.paymentMethod || "Unknown",
            productOffer,
            productEffectiveDiscount,
            productDiscountSource,
            couponApplied,
            couponCode,
            couponPercent,
            couponDescription,
            orderNumber: order.orderNumber || `ORD${order._id.toString().slice(-6)}`,
          };

          salesData.push(saleEntry);
        } catch (err) {
          console.error("Error processing order item:", err);
        }
      }
    }

    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      salesData = salesData.filter(
        (item) =>
          (item.buyer && item.buyer.toLowerCase().includes(searchLower)) ||
          (item.productName && item.productName.toLowerCase().includes(searchLower)) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
          (item.category && item.category.toLowerCase().includes(searchLower)) ||
          (item.couponCode && item.couponCode.toLowerCase().includes(searchLower)) ||
          (item.orderNumber && item.orderNumber.toLowerCase().includes(searchLower))
      );
    }

    if (discountFilter) {
      if (discountFilter === "with-discount") {
        salesData = salesData.filter(
          (item) => item.discount > 0 || item.productOffer > 0 || item.couponApplied
        );
      } else if (discountFilter === "no-discount") {
        salesData = salesData.filter(
          (item) => item.discount === 0 && item.productOffer === 0 && !item.couponApplied
        );
      } else if (discountFilter === "coupon-only") {
        salesData = salesData.filter((item) => item.couponApplied);
      } else if (discountFilter === "product-offer-only") {
        salesData = salesData.filter((item) => item.productOffer > 0);
      }
    }

    // Add product offers data to the options
    const productOffers = Array.from(productOffersMap.values());

    console.timeEnd("excel-generation");
    await generateExcel(salesData, res, {
      fromDate: from || startDate.toISOString().split("T")[0],
      toDate: to || endDate.toISOString().split("T")[0],
      title: "Sales Report",
      filename: "sales_report.xlsx",
      productOffers: productOffers // Pass product offers data to the Excel generator
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