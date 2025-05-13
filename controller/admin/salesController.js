const User = require("../../model/userSchema")
const Order = require("../../model/orderSchema")
const Product = require("../../model/productScheema")
const OrderItem = require("../../model/orderItemSchema")
const { generateSalesReport, generateExcel } = require("../../utils/reportGenerator")

const loadsales = async (req, res) => {
  try {
    console.log("Starting loadsales function")
    
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const { from, to, search, discount, discountType, page = 1, discountFilter } = req.query
    const limit = 10
    const skip = (page - 1) * limit

    console.log(`Date range: ${from || startDate.toISOString()} to ${to || endDate.toISOString()}`)
    console.log(`Search: ${search || 'none'}, Discount filter: ${discountFilter || 'none'}`)

    const dateFilter = {
      orderDate: {
        $gte: from ? new Date(from) : startDate,
        $lte: to ? new Date(to) : endDate,
      },
      status: { $in: ["Delivered", "Processing", "Confirmed", "Shipped"] }, 
    }

    console.log("Fetching orders with filter:", JSON.stringify(dateFilter))

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
      })
      .sort({ orderDate: -1 })

    console.log(`Found ${orders.length} orders`)

    for (const order of orders) {
      if (order.order_items && order.order_items.length > 0) {
  
        for (let i = 0; i < order.order_items.length; i++) {
          const itemId = order.order_items[i];
          try {
            const populatedItem = await OrderItem.findById(itemId)
              .populate({
                path: "productId",
                select: "name categoryId offer effectiveDiscount discountSource",
                populate: {
                  path: "categoryId",
                  select: "name",
                },
              })
              .populate({
                path: "couponId",
                select: "coupencode couponpercent description",
              });
            
            if (populatedItem) {
              order.order_items[i] = populatedItem;
            }
          } catch (err) {
            console.error(`Error populating order item ${itemId}:`, err);
          }
        }
      }
    }

    console.log("Finished populating order items")

    let salesData = []
    let uniqueCoupons = new Set()
    let ordersWithCouponsCount = 0

    for (const order of orders) {
      console.log(`Processing order ${order._id}, items: ${order.order_items ? order.order_items.length : 0}`)
      
 
      const orderHasCoupon = order.couponApplied || false
      if (orderHasCoupon) {
        ordersWithCouponsCount++
        if (order.couponCode) {
          uniqueCoupons.add(order.couponCode)
          console.log(`Added coupon ${order.couponCode} to unique coupons`)
        }
      }

     
      if (!order.order_items || !Array.isArray(order.order_items)) {
        console.log(`Order ${order._id} has no items or items is not an array`)
        continue
      }

      for (const item of order.order_items) {
        if (!item || !item.productId) {
          console.log("Skipping item with no product ID")
          continue
        }

        try {
         
          const productName = item.product_name || "Unknown Product"
          const productId = item.productId._id || "Unknown ID"
          const quantity = item.quantity || 0
          const price = item.price || 0
          const totalAmount = item.total_amount || 0
      
          const discountPerUnit = item.discountPerUnit || 0
          const discountAmount = item.discountAmount || (discountPerUnit * quantity) || 0
          

          let discountPercentage = 0
          if (item.couponDiscountPercent) {
            discountPercentage = item.couponDiscountPercent
          } else if (discountPerUnit > 0 && price > 0) {
            discountPercentage = Math.round((discountPerUnit / price) * 100)
          }


          const productOffer = item.productId.offer || 0
          const productEffectiveDiscount = item.productId.effectiveDiscount || 0
          const productDiscountSource = item.productId.discountSource || 'none'

          const couponApplied = item.couponApplied || orderHasCoupon || false
          const couponCode = item.couponCode || (order.couponCode || '')
          const couponPercent = item.couponDiscountPercent || (order.couponDiscountPercent || 0)
          
    
          let couponDescription = ''
          if (item.couponId && item.couponId.description) {
            couponDescription = item.couponId.description
          } else if (order.couponId && order.couponId.description) {
            couponDescription = order.couponId.description
          }

          let category = "Uncategorized"
          if (item.productId.categoryId && item.productId.categoryId.name) {
            category = item.productId.categoryId.name
          }


          const saleEntry = {
            buyer: order.userId ? order.userId.fullname : "Unknown",
            productName: productName,
            productId: productId,
            sku: `#${productId.toString().slice(-5)}`,
            quantity: quantity,
            price: price,
            discount: discountAmount,
            discountPercentage: discountPercentage,
            category: category,
            total: totalAmount,
            orderDate: order.orderDate || new Date(),
            status: order.status || "Unknown",
            paymentMethod: order.paymentMethod || "Unknown",

            productOffer: productOffer,
            productEffectiveDiscount: productEffectiveDiscount,
            productDiscountSource: productDiscountSource,
          
            couponApplied: couponApplied,
            couponCode: couponCode,
            couponPercent: couponPercent,
            couponDescription: couponDescription,
            orderNumber: order.orderNumber || `ORD${order._id.toString().slice(-6)}`
          }

          salesData.push(saleEntry)
          
          if (couponApplied) {
            console.log(`Added sale with coupon: ${couponCode}, percent: ${couponPercent}%`)
          }
        } catch (err) {
          console.error("Error processing order item:", err)
        }
      }
    }

    console.log(`Processed ${salesData.length} sales entries`)
    console.log(`Found ${uniqueCoupons.size} unique coupons`)
    console.log(`Found ${ordersWithCouponsCount} orders with coupons`)

    if (search) {
      const searchLower = search.toLowerCase()
      salesData = salesData.filter(
        (item) =>
          (item.buyer && item.buyer.toLowerCase().includes(searchLower)) ||
          (item.productName && item.productName.toLowerCase().includes(searchLower)) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
          (item.category && item.category.toLowerCase().includes(searchLower)) ||
          (item.couponCode && item.couponCode.toLowerCase().includes(searchLower)) ||
          (item.orderNumber && item.orderNumber.toLowerCase().includes(searchLower)),
      )
      console.log(`After search filter: ${salesData.length} entries`)
    }


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
      console.log(`After discount filter: ${salesData.length} entries`)
    }

    const totalSales = salesData.reduce((sum, item) => sum + (item.total || 0), 0)
    const totalItems = salesData.reduce((sum, item) => sum + (item.quantity || 0), 0)
    const totalDiscounts = salesData.reduce((sum, item) => sum + (item.discount || 0), 0)
    

    const totalProductDiscounts = salesData.reduce((sum, item) => {
      const productDiscountAmount = ((item.price || 0) * ((item.productEffectiveDiscount || 0) / 100)) * (item.quantity || 0)
      return sum + productDiscountAmount
    }, 0)

  
    const totalCouponDiscounts = salesData.reduce((sum, item) => {
      if (item.couponApplied) {
   
        if (item.discount > 0) {
          return sum + item.discount
        }

        const couponDiscountAmount = ((item.price || 0) * ((item.couponPercent || 0) / 100)) * (item.quantity || 0)
        return sum + couponDiscountAmount
      }
      return sum
    }, 0)

    const uniqueCustomers = new Set(salesData.map((item) => item.buyer)).size
    

    const ordersWithCoupons = salesData.filter(item => item.couponApplied).length
    const couponUsageCount = uniqueCoupons.size

    console.log("Calculated totals:")
    console.log(`Total sales: ${totalSales}`)
    console.log(`Total items: ${totalItems}`)
    console.log(`Total discounts: ${totalDiscounts}`)
    console.log(`Total product discounts: ${totalProductDiscounts}`)
    console.log(`Total coupon discounts: ${totalCouponDiscounts}`)
    console.log(`Unique customers: ${uniqueCustomers}`)
    console.log(`Orders with coupons: ${ordersWithCoupons}`)
    console.log(`Coupon usage count: ${couponUsageCount}`)

    const totalReports = salesData.length
    const totalPages = Math.ceil(totalReports / limit)
    const paginatedSalesData = salesData.slice(skip, skip + limit)

    console.log(`Rendering page ${page} of ${totalPages}`)

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
    })
  } catch (error) {
    console.error("Unable to load the sales page:", error)
    return res.status(500).json({ success: false, message: "Server error: " + error.message })
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
