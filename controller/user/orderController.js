const mongoose = require("mongoose");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const Cart = require("../../model/cartScheema");
const Address = require("../../model/AddressScheema");
const Product = require("../../model/productScheema");
const PDFDocument = require("pdfkit");

const placeOrder = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { paymentMethod } = req.body;

    if (!paymentMethod || paymentMethod !== "COD") {
      throw new Error("Invalid payment method");
    }

    const userCart = await Cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      throw new Error("Cart is empty");
    }

    for (const item of userCart.items) {
      const product = await Product.findById(item.productId._id);
      const variant = product.variants.find((v) => v.size === item.size);
      if (!variant) {
        throw new Error(`Size ${item.size} not available for ${product.name}`);
      }
      if (variant.variantQuantity < item.quantity) {
        throw new Error(
          `Insufficient stock for ${product.name} (Size: ${item.size})`
        );
      }
    }

    const addressId = req.session.checkout?.addressId;
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      throw new Error("Invalid address ID");
    }

    const selectedAddress = await Address.findOne({ _id: addressId, userId });
    if (!selectedAddress) {
      throw new Error("Invalid or missing address");
    }

    const cartItems = userCart.items;
    let totalPrice = 0;

    for (const item of cartItems) {
      const product = await Product.findById(item.productId._id);
      const variant = product.variants.find((v) => v.size === item.size);
      totalPrice += variant.salePrice * item.quantity;
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const grandTotal = totalPrice + deliveryCharge;

    const orderNumber = `ORD${Date.now().toString().slice(-6)}`;

    const newOrder = new Order({
      userId,
      paymentMethod,
      orderDate: new Date(),
      status: "Pending",
      address: selectedAddress._id,
      total: grandTotal,
      order_items: [],
      orderNumber,
    });

    await newOrder.save();

    const orderItems = [];

    for (const item of cartItems) {
      const product = await Product.findById(item.productId._id);
      const variantIndex = product.variants.findIndex(
        (v) => v.size === item.size
      );
      if (variantIndex === -1) {
        throw new Error(`Variant not found for size ${item.size}`);
      }

      const variant = product.variants[variantIndex];

      const orderItem = new OrderItem({
        product_name: product.name,
        productId: product._id,
        orderId: newOrder._id,
        size: item.size,
        price: variant.salePrice,
        quantity: item.quantity,
        total_amount: variant.salePrice * item.quantity,
      });

      await orderItem.save();
      orderItems.push(orderItem._id);

      product.variants[variantIndex].variantQuantity -= item.quantity;
      await product.save();
    }

    newOrder.order_items = orderItems;
    await newOrder.save();

    await Cart.findOneAndUpdate({ userId }, { items: [] });

    delete req.session.checkout;

    return res.status(200).json({
      success: true,
      message: "Order placed successfully",
      redirect: `/order-success?orderId=${newOrder._id}`,
    });
  } catch (error) {
    console.error("placeOrder Error:", error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const loadOrderSuccess = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      throw new Error("Invalid order ID");
    }

    const userId = req.user._id.toString(); // Guaranteed by UserAuth middleware
    const order = await Order.findById(orderId)
      .populate("order_items")
      .populate("address")
      .lean();

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.userId.toString() !== userId) {
      throw new Error("Unauthorized access");
    }

    res.render("order-success", {
      order,
      user: req.user,
    });
  } catch (error) {
    console.error("loadOrderSuccess Error:", error.message);
    res.redirect("/page-not-found");
  }
};

const getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id.toString(); // Guaranteed by UserAuth middleware
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ userId })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          model: "Product",
          select: "name images variants",
        },
      })
      .populate("address")
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments({ userId });
    const totalPages = Math.ceil(totalOrders / limit);

    const getProgressWidth = (status) => {
      const steps = [
        "Pending",
        "Processing",
        "Confirmed",
        "Shipped",
        "Delivered",
      ];
      if (status === "Cancelled" || status === "Return Requested") return 100;
      const index = steps.indexOf(status);
      return index >= 0 ? ((index + 1) / steps.length) * 100 : 20;
    };

    const ordersWithProgress = orders.map((order) => ({
      ...order._doc,
      progressWidth: getProgressWidth(order.status),
    }));

    res.render("Orders", {
      orders: ordersWithProgress,
      user: req.user,
      currentPage: page,
      totalPages,
      hasOrders: orders.length > 0,
    });
  } catch (error) {
    console.error("getUserOrders Error:", error.message);
    res.redirect("/page-not-found");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { cancelReason } = req.body;
    const userId = req.user._id.toString(); // Guaranteed by UserAuth middleware

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findOne({ _id: orderId, userId }).populate(
      "order_items"
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status !== "Pending" && order.status !== "Processing") {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled in ${order.status} status`,
      });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { _id: orderId, userId, status: { $in: ["Pending", "Processing"] } },
      {
        status: "Cancelled",
        cancelReason: cancelReason || "No reason provided",
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(400).json({
        success: false,
        message: "Failed to cancel order: Order not in cancellable status",
      });
    }

    for (const item of order.order_items) {
      const product = await Product.findById(item.productId);
      const variantIndex = product.variants.findIndex(
        (v) => v.size === item.size
      );
      if (variantIndex !== -1) {
        product.variants[variantIndex].variantQuantity += item.quantity;
        await product.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("cancelOrder Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while cancelling order",
    });
  }
};

const initiateReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { returnReason } = req.body;
    const userId = req.user._id.toString(); // Guaranteed by UserAuth middleware

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("initiateReturn: Invalid order ID:", orderId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    if (!returnReason || returnReason.trim() === "") {
      console.error("initiateReturn: Return reason is required");
      return res.status(400).json({
        success: false,
        message: "Please provide a reason for the return",
      });
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate("order_items")
      .select("status userId refunded deliveryDate orderDate order_items");

    if (!order) {
      console.error(
        `initiateReturn: Order not found for ID: ${orderId}, User ID: ${userId}`
      );
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status !== "Delivered") {
      console.error(
        `initiateReturn: Order cannot be returned, status: ${order.status}`
      );
      return res.status(400).json({
        success: false,
        message: `This order cannot be returned because it is in ${order.status} status. Returns are only allowed for delivered orders.`,
      });
    }

    const deliveryDate = order.deliveryDate
      ? new Date(order.deliveryDate)
      : new Date(order.orderDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const returnWindowDays = 5;
    const returnWindowEnd = new Date(
      deliveryDate.getTime() + returnWindowDays * 24 * 60 * 60 * 1000
    );
    const now = new Date();

    if (now > returnWindowEnd) {
      console.error(
        `initiateReturn: Return window expired for order ID: ${orderId}`
      );
      return res.status(400).json({
        success: false,
        message: `The return window of ${returnWindowDays} days has expired for this order.`,
      });
    }

    if (
      ["Return Requested", "Return Approved", "Returned"].includes(
        order.status
      ) ||
      order.refunded === true
    ) {
      console.error(
        `initiateReturn: Order already processed for return or refunded, status: ${order.status}, refunded: ${order.refunded}`
      );
      return res.status(400).json({
        success: false,
        message: "This order has already been returned or a return is pending.",
      });
    }

    for (const item of order.order_items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        throw new Error(`Product ${item.product_name} not found`);
      }
      const variantIndex = product.variants.findIndex(
        (v) => v.size === item.size
      );
      if (variantIndex === -1) {
        throw new Error(`Variant not found for size ${item.size}`);
      }
      product.variants[variantIndex].variantQuantity += item.quantity;
      await product.save();
    }

    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: orderId,
        userId,
        status: "Delivered",
        refunded: { $ne: true },
      },
      {
        status: "Return Requested",
        returnReason,
        returnRequestedDate: new Date(),
      },
      { new: true }
    );

    if (!updatedOrder) {
      console.error(
        `initiateReturn: Failed to update order status for ID: ${orderId}`
      );

      for (const item of order.order_items) {
        const product = await Product.findById(item.productId);
        if (product) {
          const variantIndex = product.variants.findIndex(
            (v) => v.size === item.size
          );
          if (variantIndex !== -1) {
            product.variants[variantIndex].variantQuantity -= item.quantity;
            await product.save();
          }
        }
      }

      return res.status(400).json({
        success: false,
        message:
          "Failed to initiate return. The order may no longer be eligible or was modified.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Return initiated successfully. Please await admin approval.",
    });
  } catch (error) {
    console.error("initiateReturn Error:", error.message, error.stack);
    return res.status(500).json({
      success: false,
      message: `An error occurred while initiating the return: ${error.message}`,
    });
  }
};

const reOrder = async (req, res) => {
  let newOrderId = null;
  try {
    const orderId = req.params.id;
    const userId = req.user._id.toString(); // Guaranteed by UserAuth middleware

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("reOrder: Invalid order ID:", orderId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: "order_items",
        populate: { path: "productId", model: "Product" },
      })
      .populate("address");

    if (!order) {
      console.error(
        `reOrder: Order not found for ID: ${orderId}, User ID: ${userId}`
      );
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const selectedAddress = await Address.findOne({
      _id: order.address._id,
      userId,
    });
    if (!selectedAddress) {
      console.error(
        `reOrder: Address not found for ID: ${order.address._id}, User ID: ${userId}`
      );
      return res.status(400).json({
        success: false,
        message: "Selected address is no longer valid",
      });
    }

    let totalPrice = 0;
    for (const item of order.order_items) {
      const product = await Product.findById(item.productId._id);
      if (!product || product.isDeleted) {
        throw new Error(`Product ${item.product_name} is no longer available`);
      }
      const variant = product.variants.find((v) => v.size === item.size);
      if (!variant) {
        throw new Error(`Size ${item.size} not available for ${product.name}`);
      }
      if (variant.variantQuantity < item.quantity) {
        throw new Error(
          `Insufficient stock for ${product.name} (Size: ${item.size})`
        );
      }
      totalPrice += variant.salePrice * item.quantity;
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    const grandTotal = totalPrice + deliveryCharge;

    const orderNumber = `ORD${Date.now().toString().slice(-6)}`;

    const newOrder = new Order({
      userId,
      paymentMethod: order.paymentMethod,
      orderDate: new Date(),
      status: "Pending",
      address: selectedAddress._id,
      total: grandTotal,
      order_items: [],
      orderNumber,
    });

    await newOrder.save();
    newOrderId = newOrder._id;

    const orderItems = [];
    for (const item of order.order_items) {
      const product = await Product.findById(item.productId._id);
      const variantIndex = product.variants.findIndex(
        (v) => v.size === item.size
      );
      if (variantIndex === -1) {
        throw new Error(`Variant not found for size ${item.size}`);
      }

      const variant = product.variants[variantIndex];

      const orderItem = new OrderItem({
        product_name: product.name,
        productId: product._id,
        orderId: newOrder._id,
        size: item.size,
        price: variant.salePrice,
        quantity: item.quantity,
        total_amount: variant.salePrice * item.quantity,
      });

      await orderItem.save();
      orderItems.push(orderItem._id);

      product.variants[variantIndex].variantQuantity -= item.quantity;
      if (product.variants[variantIndex].variantQuantity < 0) {
        throw new Error(
          `Stock update failed for ${product.name} (Size: ${item.size})`
        );
      }
      await product.save();
    }

    newOrder.order_items = orderItems;
    await newOrder.save();

    req.session.checkout = { addressId: selectedAddress._id.toString() };

    return res.status(200).json({
      success: true,
      message: "Order placed successfully",
      redirect: `/order-success?orderId=${newOrder._id}`,
    });
  } catch (error) {
    console.error("reOrder Error:", error.message, error.stack);

    if (newOrderId) {
      const order = await Order.findById(newOrderId).populate("order_items");
      if (order) {
        for (const item of order.order_items) {
          const product = await Product.findById(item.productId);
          if (product) {
            const variantIndex = product.variants.findIndex(
              (v) => v.size === item.size
            );
            if (variantIndex !== -1) {
              product.variants[variantIndex].variantQuantity += item.quantity;
              await product.save();
            }
          }
        }
        await Order.findByIdAndDelete(newOrderId);
        await OrderItem.deleteMany({ orderId: newOrderId });
      }
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to reorder",
    });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user._id.toString(); // Guaranteed by UserAuth middleware

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("getOrderDetails: Invalid order ID:", orderId);
      return res.redirect("/page-not-found");
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          model: "Product",
          select: "name images variants",
        },
      })
      .populate("address");

    if (!order) {
      console.error(
        `getOrderDetails: Order not found for ID: ${orderId}, User ID: ${userId}`
      );
      return res.redirect("/page-not-found");
    }

    res.render("orderDetails", { order, user: req.user });
  } catch (error) {
    console.error("getOrderDetails Error:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user._id.toString(); // Guaranteed by UserAuth middleware

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("downloadInvoice: Invalid order ID:", orderId);
      throw new Error("Invalid order ID");
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: "order_items",
        populate: { path: "productId", model: "Product" },
      })
      .populate("address");

    if (!order) {
      console.error(
        `downloadInvoice: Order not found for ID: ${orderId}, User ID: ${userId}`
      );
      throw new Error("Order not found");
    }

    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
      info: {
        Title: `Invoice ORD${order.orderNumber}`,
        Author: "Elite Wear",
        Subject: "Customer Invoice",
        Creator: "Elite Wear Billing System",
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-ORD${order.orderNumber}.pdf`
    );
    doc.pipe(res);

    doc.registerFont("Helvetica-Bold", "Helvetica-Bold");
    doc.registerFont("Helvetica", "Helvetica");

    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor("#2c3e50")
      .text("ELITE WEAR", 50, 50);

    doc.font("Helvetica").fontSize(10).fillColor("#34495e");

    const companyInfo = [
      "123 Fashion Avenue",
      "New York, NY 10001",
      "Phone: (111) 123-1234",
      "Email: billing@elitewear.com",
      "Website: www.elitewear.com",
    ];

    let yPos = 80;
    companyInfo.forEach((line) => {
      doc.text(line, 50, yPos);
      yPos += 15;
    });

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#2c3e50")
      .text("INVOICE", 400, 50);

    const invoiceDetails = [
      { label: "Invoice #", value: `ORD${order.orderNumber}` },
      {
        label: "Date",
        value: new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
      },
      {
        label: "Due Date",
        value: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toLocaleDateString("en-US"),
      },
    ];

    yPos = 80;
    invoiceDetails.forEach((detail) => {
      doc.font("Helvetica-Bold").fontSize(10).text(detail.label, 400, yPos);
      doc.font("Helvetica").text(detail.value, 450, yPos);
      yPos += 15;
    });

    const customerAddress = order.address || {};
    const addressLines = [
      customerAddress.name || "Customer Name",
      customerAddress.street || "Street Address",
      `${customerAddress.city || "City"}, ${customerAddress.state || "State"} ${
        customerAddress.zip || "ZIP"
      }`,
      customerAddress.country || "Country",
      customerAddress.phone || "",
    ].filter((line) => line);

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#2c3e50")
      .text("Bill To:", 50, 160);

    yPos = 180;
    doc.font("Helvetica").fontSize(10);
    addressLines.forEach((line) => {
      doc.text(line, 50, yPos);
      yPos += 15;
    });

    const tableTop = 260;
    doc.rect(50, tableTop, 500, 25).fill("#f1f3f5");

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#2c3e50");

    const headers = [
      { text: "Item Description", x: 55, width: 280 },
      { text: "Quantity", x: 335, width: 60 },
      { text: "Unit Price", x: 395, width: 60 },
      { text: "Total", x: 455, width: 90 },
    ];

    headers.forEach((header) => {
      doc.text(header.text, header.x, tableTop + 8, {
        width: header.width,
        align: header.text === "Total" ? "right" : "left",
      });
    });

    yPos = tableTop + 35;
    let subtotal = 0;

    doc.font("Helvetica").fillColor("#34495e");

    // Updated to use actual order items instead of hardcoded items
    const items = order.order_items.map((item) => ({
      description: `${item.product_name} (Size: ${item.size})`,
      quantity: item.quantity,
      price: item.price,
    }));

    items.forEach((item) => {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      const row = [
        { text: item.description, x: 55, width: 280 },
        { text: item.quantity.toString(), x: 335, width: 60 },
        { text: `₹${item.price.toFixed(2)}`, x: 395, width: 60 },
        { text: `₹${itemTotal.toFixed(2)}`, x: 455, width: 90 },
      ];

      row.forEach((cell) => {
        doc.text(cell.text, cell.x, yPos, {
          width: cell.width,
          align: cell.x === 455 ? "right" : "left",
        });
      });

      yPos += 20;
      doc
        .moveTo(50, yPos - 5)
        .lineTo(550, yPos - 5)
        .strokeColor("#ececec")
        .stroke();
    });

    const deliveryCharge = order.total - subtotal;
    const grandTotal = order.total;

    const totals = [
      { label: "Subtotal", value: subtotal.toFixed(2), bold: false },
      { label: "Delivery Charge", value: deliveryCharge.toFixed(2), bold: false },
      { label: "Total", value: grandTotal.toFixed(2), bold: true },
    ];

    yPos += 20;
    totals.forEach((total) => {
      doc
        .font(total.bold ? "Helvetica-Bold" : "Helvetica")
        .text(total.label, 400, yPos);
      doc.text(`₹${total.value}`, 455, yPos, { width: 90, align: "right" });
      yPos += 15;
    });

    doc.rect(0, doc.page.height - 80, doc.page.width, 80).fill("#2c3e50");

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#ffffff")
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
    res.redirect("/page-not-found");
  }
};

const trackOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user._id.toString(); // Guaranteed by UserAuth middleware

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("trackOrder: Invalid order ID:", orderId);
      return res.redirect("/page-not-found");
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          model: "Product",
          select: "name images variants",
        },
      })
      .populate("address")
      .lean();

    if (!order) {
      console.error(
        `trackOrder: Order not found for ID: ${orderId}, User ID: ${userId}`
      );
      return res.redirect("/page-not-found");
    }

    const getProgressWidth = (status) => {
      const steps = [
        "Pending",
        "Processing",
        "Confirmed",
        "Shipped",
        "Delivered",
      ];
      if (status === "Cancelled" || status === "Return Requested") return 100;
      const index = steps.indexOf(status);
      return index >= 0 ? ((index + 1) / steps.length) * 100 : 20;
    };

    let trackingSteps;
    if (order.status === "Cancelled") {
      trackingSteps = [
        {
          status: "Cancelled",
          icon: "fa-times",
          date: new Date().toLocaleDateString(),
          active: true,
        },
      ];
    } else if (order.status === "Return Requested") {
      trackingSteps = [
        {
          status: "Return Requested",
          icon: "fa-undo",
          date: new Date().toLocaleDateString(),
          active: true,
        },
      ];
    } else {
      trackingSteps = [
        {
          status: "Order Confirmed",
          icon: "fa-check",
          date: order.orderDate.toLocaleDateString(),
          active: [
            "Pending",
            "Processing",
            "Confirmed",
            "Shipped",
            "Delivered",
          ].includes(order.status),
        },
        {
          status: "Shipped",
          icon: "fa-box",
          date:
            order.status === "Shipped" || order.status === "Delivered"
              ? new Date().toLocaleDateString()
              : "-",
          active: ["Shipped", "Delivered"].includes(order.status),
        },
        {
          status: "Out for Delivery",
          icon: "fa-truck",
          date:
            order.status === "Delivered"
              ? new Date().toLocaleDateString()
              : "-",
          active: order.status === "Delivered",
        },
        {
          status: "Delivered",
          icon: "fa-home",
          date:
            order.status === "Delivered"
              ? new Date().toLocaleDateString()
              : "-",
          active: order.status === "Delivered",
        },
      ];
    }

    res.render("orderTracking", {
      order,
      user: req.user,
      progressWidth: getProgressWidth(order.status),
      trackingSteps,
    });
  } catch (error) {
    console.error("trackOrder Error:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

module.exports = {
  placeOrder,
  loadOrderSuccess,
  getUserOrders,
  cancelOrder,
  initiateReturn,
  reOrder,
  getOrderDetails,
  downloadInvoice,
  trackOrder,
};