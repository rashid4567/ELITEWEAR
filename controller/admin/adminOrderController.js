const mongoose = require("mongoose");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const User = require("../../model/userSchema");
const Product = require("../../model/productScheema");
const Wallet = require("../../model/walletScheema");
const { v4: uuidv4 } = require("uuid");

const getorderController = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "All",
      search = "",
      sort = "createdAt",
      order = "desc",
      timeRange = "all",
    } = req.query;

    const query = {};
    if (status !== "All") {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { "userId.email": { $regex: search, $options: "i" } },
      ];
    }

    if (timeRange !== "all") {
      const now = new Date();
      let startDate;
      switch (timeRange) {
        case "12m":
          startDate = new Date(now.setMonth(now.getMonth() - 12));
          break;
        case "30d":
          startDate = new Date(now.setDate(now.getDate() - 30));
          break;
        case "7d":
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case "24h":
          startDate = new Date(now.setHours(now.getHours() - 24));
          break;
        default:
          startDate = null;
      }
      if (startDate) {
        query.orderDate = { $gte: startDate };
      }
    }

    const sortOrder = order === "asc" ? 1 : -1;
    const sortField =
      sort === "orderNumber" ? "orderNumber" : sort === "total" ? "total" : "createdAt";

    const orders = await Order.find(query)
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          model: "Product",
        },
      })
      .populate("userId")
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const totalOrders = await Order.countDocuments(query);

    const formattedOrders = orders.map((order) => ({
      ...order,
      order_items: Array.isArray(order.order_items) ? order.order_items : [],
    }));

    res.render("ordermanagment", {
      orders: formattedOrders,
      currentPage: Number(page),
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders,
      currentStatus: status,
      searchQuery: search,
      sort,
      sortOrder: order,
      timeRange,
      limit: Number(limit),
    });
  } catch (error) {
    console.error(
      "getorderController: Error fetching orders:",
      error.message,
      error.stack
    );
    res.status(500).render("error", { message: "Internal server error" });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    const validStatuses = [
      "Pending",
      "Processing",
      "Confirmed",
      "Shipped",
      "Delivered",
      "Cancelled",
      "Return Requested",
      "Return Approved",
      "Returned",
      "Return Rejected",
    ];
    if (!validStatuses.includes(status)) {
      console.error("updateOrderStatus: Invalid status:", status);
      return res
        .status(400)
        .json({ success: false, message: `Invalid status: ${status}` });
    }

    let order;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId);
    } else {
      order = await Order.findOne({ orderNumber: orderId });
    }

    if (!order) {
      console.error(
        "updateOrderStatus: Order not found for ID/orderNumber:",
        orderId
      );
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status === "Cancelled" && status === "Delivered") {
      console.error(
        "updateOrderStatus: Cannot deliver a cancelled order:",
        orderId
      );
      return res
        .status(400)
        .json({ success: false, message: "Cannot deliver a cancelled order" });
    }

    order.status = status;
    if (status === "Delivered" && !order.deliveryDate) {
      order.deliveryDate = new Date();
    }
    await order.save();

    res.json({ success: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error(
      "Error in updateOrderStatus:",
      error.message,
      error.stack
    );
    res
      .status(500)
      .json({ success: false, message: "Server issue: " + error.message });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .render("page-404", { message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId)
      .populate({
        path: "userId",
        select: "fullname email",
      })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          select: "name images",
        },
      })
      .populate("address")
      .lean();

    if (!order) {
      return res
        .status(404)
        .render("page-404", { message: "Order not found" });
    }

    const formattedOrder = {
      _id: order._id.toString(),
      orderId: order.orderNumber || order._id,
      products: order.order_items.map((item) => {
        if (!item.productId) {
          console.error("Product not found for order item:", item);
          return {
            name: item.product_name || "Unknown Product",
            image: "/api/placeholder/50/50",
            quantity: item.quantity || 1,
            price: (item.price || 0).toFixed(2),
            total: (item.total_amount || 0).toFixed(2),
          };
        }
        return {
          name: item.product_name || item.productId.name || "Unknown Product",
          image: item.productId.images?.[0]?.url || "/api/placeholder/50/50",
          quantity: item.quantity || 1,
          price: (item.price || 0).toFixed(2),
          total: (item.total_amount || 0).toFixed(2),
        };
      }),
      date: order.orderDate || order.createdAt,
      formattedDate: new Date(
        order.orderDate || order.createdAt
      ).toLocaleString("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      customer: {
        fullname: order.userId?.fullname || "Unknown",
        email: order.userId?.email || "N/A",
      },
      total: (order.total || 0).toFixed(2),
      payment: order.paymentMethod || "N/A",
      status: order.status || "Pending",
      address: order.address || {},
    };

    res.render("adminorderDetails", { order: formattedOrder });
  } catch (error) {
    console.error("Error in getOrderDetails:", error);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

const manageReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { action, rejectionReason } = req.body;
   

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("manageReturn: Invalid order ID:", orderId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    if (!["approve", "reject"].includes(action)) {
      console.error("manageReturn: Invalid action:", action);
      return res
        .status(400)
        .json({ success: false, message: "Invalid action" });
    }

    if (action === "reject" && (!rejectionReason || rejectionReason.trim() === "")) {
      console.error("manageReturn: Rejection reason is required");
      return res
        .status(400)
        .json({ success: false, message: "Rejection reason is required" });
    }

    const order = await Order.findById(orderId).populate({
      path: "order_items",
      populate: {
        path: "productId",
        model: "Product",
      },
    });
    if (!order) {
      console.error(`manageReturn: Order not found for ID: ${orderId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }



    if (order.refunded) {
      console.error(
        `manageReturn: Refund already processed for order ID: ${orderId}`
      );
      return res.status(400).json({
        success: false,
        message: "Refund already processed for this order",
      });
    }

    if (action === "approve") {
      if (order.status !== "Return Requested") {
        console.error(
          `manageReturn: Cannot approve return, current status: ${order.status}`
        );
        return res.status(400).json({
          success: false,
          message: `Cannot approve return for order in ${order.status} status`,
        });
      }

      // Validate order_items
      if (!order.order_items || order.order_items.length === 0) {
        console.error(`manageReturn: No valid order items found for order ID: ${orderId}`);
        return res.status(400).json({
          success: false,
          message: "No valid order items found for refund",
        });
      }

      for (const item of order.order_items) {
        if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
          console.error(`manageReturn: Invalid product ID in order item: ${JSON.stringify(item)}`);
          return res.status(400).json({
            success: false,
            message: `Invalid product ID in order item: ${item._id}`,
          });
        }
        if (!item.quantity || item.quantity <= 0) {
          console.error(`manageReturn: Invalid quantity in order item: ${JSON.stringify(item)}`);
          return res.status(400).json({
            success: false,
            message: `Invalid quantity in order item: ${item._id}`,
          });
        }
        if (!item.size) {
          console.error(`manageReturn: Missing size in order item: ${JSON.stringify(item)}`);
          return res.status(400).json({
            success: false,
            message: `Missing size in order item: ${item._id}`,
          });
        }
      }

      // Update order status to Return Approved
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: "Return Approved" },
        { new: true }
      );

      if (!updatedOrder) {
        console.error(
          `manageReturn: Failed to update order status to Return Approved for ID: ${orderId}`
        );
        return res.status(500).json({
          success: false,
          message: "Failed to update order status to Return Approved",
        });
      }



      try {
    
        await processRefund(updatedOrder);


        updatedOrder.refunded = true;
        updatedOrder.status = "Returned";
        await updatedOrder.save();

       
        return res.status(200).json({
          success: true,
          message: "Return approved and refund processed successfully",
        });
      } catch (error) {
        console.error(
          "manageReturn: Failed to process refund, rolling back status for order ID:",
          orderId,
          error.message,
          error.stack
        );
        // Rollback order status
        await Order.findByIdAndUpdate(orderId, { status: "Return Requested" });
        throw error;
      }
    } else {
      if (order.status !== "Return Requested") {
        console.error(
          `manageReturn: Cannot reject return, current status: ${order.status}`
        );
        return res.status(400).json({
          success: false,
          message: `Cannot reject return for order in ${order.status} status`,
        });
      }

      // Reject return
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: "Return Rejected", returnRejectionReason: rejectionReason },
        { new: true }
      );

      if (!updatedOrder) {
        console.error(
          `manageReturn: Failed to update order status to Return Rejected for ID: ${orderId}`
        );
        return res.status(500).json({
          success: false,
          message: "Failed to update order status to Return Rejected",
        });
      }

  
      return res.status(200).json({
        success: true,
        message: "Return rejected successfully",
      });
    }
  } catch (error) {
    console.error(
      "manageReturn: Error processing return for order ID:",
      req.params.id,
      error.message,
      error.stack
    );
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`,
    });
  }
};

const processRefund = async (order) => {
  try {
  
    if (!order.order_items || order.order_items.length === 0) {
      throw new Error("No order items found for refund");
    }


    for (const item of order.order_items) {
   
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
        console.warn(`processRefund: Skipping invalid product ID: ${item.productId}`);
        continue;
      }
      if (!item.quantity || item.quantity <= 0) {
        console.warn(`processRefund: Skipping invalid quantity: ${item.quantity}`);
        continue;
      }
      if (!item.size) {
        console.warn(`processRefund: Skipping missing size in order item: ${item._id}`);
        continue;
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        console.warn(`processRefund: Product not found for ID: ${item.productId}, skipping`);
        continue;
      }

      const variantIndex = product.variants.findIndex(
        (v) => v.size === item.size
      );
      if (variantIndex === -1) {
        console.warn(
          `processRefund: Variant with size ${item.size} not found for product ID: ${item.productId}, skipping`
        );
        continue;
      }

   
      product.variants[variantIndex].variantQuantity += item.quantity;
      await product.save();
    }

  
    const refundAmount = order.total;
    if (refundAmount <= 0) {
      throw new Error(
        "Invalid refund amount: Amount must be greater than zero"
      );
    }

    let wallet = await Wallet.findOne({ userId: order.userId });
    if (!wallet) {
      wallet = new Wallet({
        userId: order.userId,
        amount: 0,
        transactions: [],
      });
    }

    wallet.amount += refundAmount;
    wallet.transactions.push({
      type: "credit",
      amount: refundAmount,
      transactionRef: `TXN-REFUND-${uuidv4()}`,
      description: `Refund for order ${order.orderNumber || order._id}`,
      date: new Date(),
    });

    await wallet.save();



    const AuditLog = mongoose.model(
      "AuditLog",
      new mongoose.Schema({
        action: String,
        orderId: mongoose.Schema.Types.ObjectId,
        userId: mongoose.Schema.Types.ObjectId,
        amount: Number,
        timestamp: { type: Date, default: Date.now },
      })
    );
    await new AuditLog({
      action: "REFUND_PROCESSED",
      orderId: order._id,
      userId: order.userId,
      amount: refundAmount,
    }).save();
 
  } catch (error) {
    console.error(
      "processRefund: Error processing refund for order ID:",
      order._id,
      error.message,
      error.stack
    );
    throw error;
  }
};
const admindownloadInvoice = async (req, res) => {
    try {
      const orderId = req.params.id;
  
      // Validate orderId
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        console.error("downloadInvoice: Invalid order ID:", orderId);
        return res.status(400).json({ error: "Invalid order ID" });
      }
  
      // Find order by ID (no userId restriction for admin)
      const order = await Order.findById(orderId)
        .populate({
          path: "order_items",
          populate: { path: "productId", model: "Product" },
        })
        .populate("address");
  
      if (!order) {
        console.error(`downloadInvoice: Order not found for ID: ${orderId}`);
        return res.status(404).json({ error: "Order not found" });
      }
  
      // Create PDF document
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        info: {
          Title: `Invoice ORD${order.orderNumber || order._id}`,
          Author: "Elite Wear",
          Subject: "Customer Invoice",
          Creator: "Elite Wear Billing System",
        },
      });
  
      // Set response headers for PDF download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=invoice-ORD${order.orderNumber || order._id}.pdf`
      );
      doc.pipe(res);
  
      // Company Header
      doc.registerFont('Helvetica-Bold', 'Helvetica-Bold');
      doc.registerFont('Helvetica', 'Helvetica');
      
      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor('#2c3e50')
        .text("ELITE WEAR", 50, 50);
      
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#34495e');
      
      const companyInfo = [
        "123 Fashion Avenue",
        "New York, NY 10001",
        "Phone: (111) 123-1234",
        "Email: billing@elitewear.com",
        "Website: www.elitewear.com"
      ];
      
      let yPos = 80;
      companyInfo.forEach(line => {
        doc.text(line, 50, yPos);
        yPos += 15;
      });
  
      // Invoice Details
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#2c3e50')
        .text("INVOICE", 400, 50);
      
      const invoiceDetails = [
        { label: "Invoice #", value: `ORD${order.orderNumber || order._id}` },
        { 
          label: "Date", 
          value: new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        },
        { 
          label: "Due Date", 
          value: new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        }
      ];
      
      yPos = 80;
      invoiceDetails.forEach(detail => {
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(detail.label, 400, yPos);
        doc
          .font('Helvetica')
          .text(detail.value, 450, yPos);
        yPos += 15;
      });
  
      // Customer Information
      const customerAddress = order.address || {};
      const addressLines = [
        customerAddress.name || "Customer Name",
        customerAddress.street || "Street Address",
        `${customerAddress.city || "City"}, ${customerAddress.state || "State"} ${customerAddress.zip || "ZIP"}`,
        customerAddress.country || "Country",
        customerAddress.phone || ""
      ].filter(line => line);
  
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#2c3e50')
        .text("Bill To:", 50, 160);
      
      yPos = 180;
      doc.font('Helvetica').fontSize(10);
      addressLines.forEach(line => {
        doc.text(line, 50, yPos);
        yPos += 15;
      });
  
      // Items Table Header
      const tableTop = 260;
      doc
        .rect(50, tableTop, 500, 25)
        .fill('#f1f3f5');
      
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#2c3e50');
      
      const headers = [
        { text: "Item Description", x: 55, width: 280 },
        { text: "Quantity", x: 335, width: 60 },
        { text: "Unit Price", x: 395, width: 60 },
        { text: "Total", x: 455, width: 90 }
      ];
      
      headers.forEach(header => {
        doc.text(header.text, header.x, tableTop + 8, { 
          width: header.width,
          align: header.text === "Total" ? "right" : "left"
        });
      });
  
      // Items Table Content
      yPos = tableTop + 35;
      let subtotal = 0;
      
      doc.font('Helvetica').fillColor('#34495e');
      
      // Use actual order items instead of hardcoded items
      const items = order.order_items.map(item => ({
        description: `${item.productId?.name || 'Unknown Product'} (Size: ${item.size || 'N/A'})`,
        quantity: item.quantity || 1,
        price: item.price || 0,
      }));
  
      items.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        const row = [
          { text: item.description, x: 55, width: 280 },
          { text: item.quantity.toString(), x: 335, width: 60 },
          { text: `₹${item.price.toFixed(2)}`, x: 395, width: 60 },
          { text: `₹${itemTotal.toFixed(2)}`, x: 455, width: 90 }
        ];
        
        row.forEach(cell => {
          doc.text(cell.text, cell.x, yPos, { 
            width: cell.width,
            align: cell.x === 455 ? "right" : "left"
          });
        });
        
        yPos += 20;
        doc
          .moveTo(50, yPos - 5)
          .lineTo(550, yPos - 5)
          .strokeColor('#ececec')
          .stroke();
      });
  
      // Totals
      const grandTotal = subtotal;
      
      const totals = [
        { label: "Subtotal", value: subtotal.toFixed(2), bold: true },
        { label: "Grand Total", value: grandTotal.toFixed(2), bold: true }
      ];
      
      yPos += 20;
      totals.forEach(total => {
        doc
          .font(total.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(total.label, 400, yPos);
        doc.text(`₹${total.value}`, 455, yPos, { width: 90, align: "right" });
        yPos += 15;
      });
  
      // Footer
      doc
        .rect(0, doc.page.height - 80, doc.page.width, 80)
        .fill('#2c3e50');
      
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#ffffff')
        .text(
          "Thank you for shopping with Elite Wear! For any questions regarding your order, please contact our customer service at billing@elitewear.com",
          50,
          doc.page.height - 65,
          { width: 500, align: "center" }
        );
      
      doc
        .fontSize(8)
        .text(
          "Terms: Payment due within 30 days. Make checks payable to Elite Wear.",
          50,
          doc.page.height - 40,
          { width: 500, align: "center" }
        );
  
      doc.end();
    } catch (error) {
      console.error("downloadInvoice Error:", error.message, error.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  };


module.exports = {
  getorderController,
  updateOrderStatus,
  getOrderDetails,
  manageReturn,
  admindownloadInvoice,
};