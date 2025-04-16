const mongoose = require("mongoose");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const Cart = require("../../model/cartScheema");
const User = require("../../model/userSchema");
const Address = require("../../model/AddressScheema");
const Product = require("../../model/productScheema");
const PDFDocument = require("pdfkit");

const placeOrder = async (req, res) => {
  try {
    let userId;
    if (req.user) {
      userId = req.user._id.toString();
    } else if (req.session.user && req.session.user._id) {
      userId = req.session.user._id.toString();
    } else {
      console.error("placeOrder: No authenticated user found");
      return res.status(401).json({
        success: false,
        message: "Please log in to place an order",
      });
    }

    const { paymentMethod } = req.body;
    if (!paymentMethod || paymentMethod !== "COD") {
      throw new Error("Invalid payment method");
    }

    const userCart = await Cart.findOne({ userId }).populate("items.productId");
    if (!userCart || !userCart.items.length) {
      throw new Error("Cart is empty");
    }

    for (const item of userCart.items) {
      if (!item.productId) {
        throw new Error("Invalid product in cart");
      }
      const productItem = await Product.findById(item.productId._id);
      if (!productItem) {
        throw new Error(`Product not found: ${item.productId._id}`);
      }
      if (!productItem.variants || !productItem.variants[0]) {
        throw new Error(`No variants available for ${productItem.name}`);
      }
      if (productItem.variants[0].stock < item.quantity) {
        throw new Error(`Insufficient stock for ${productItem.name}`);
      }
    }

    const addressId = req.session.checkout?.addressId;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      console.error("placeOrder: Invalid addressId:", addressId);
      throw new Error("Invalid address ID");
    }

    const selectedAddress = await Address.findOne({
      _id: addressId,
      userId,
    });

    if (!selectedAddress) {
      throw new Error("Invalid or missing address");
    }

    const cartItems = userCart.items;
    const totalPrice = cartItems.reduce((total, item) => {
      const productPrice = item.productId.variants?.[0]?.salePrice || 0;
      return total + productPrice * item.quantity;
    }, 0);

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
      if (!item.productId.variants || !item.productId.variants[0]) {
        console.error(
          "placeOrder: No variants for order item:",
          item.productId
        );
        throw new Error(`No variants for ${item.productId.name}`);
      }
      const orderItem = new OrderItem({
        product_name: item.productId.name,
        productId: item.productId._id,
        orderId: newOrder._id,
        size: item.productId.variants[0].size || "M",
        price: item.productId.variants[0].salePrice || 0,
        quantity: item.quantity,
        total_amount:
          (item.productId.variants[0].salePrice || 0) * item.quantity,
      });

      await orderItem.save();
      orderItems.push(orderItem._id);

      await Product.findByIdAndUpdate(item.productId._id, {
        $inc: { "variants.0.stock": -item.quantity },
      });
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
    console.error("placeOrder: Error:", error.message, error.stack);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const loadOrderSuccess = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("loadOrderSuccess: Invalid order ID:", orderId);
      throw new Error("Invalid order ID");
    }

    const order = await Order.findById(orderId)
      .populate("order_items")
      .populate("address")
      .lean();

    if (!order) {
      console.error("loadOrderSuccess: Order not found:", orderId);
      throw new Error("Order not found");
    }

    const userId = req.user?._id.toString() || req.session.user?._id;
    if (order.userId.toString() !== userId) {
      console.error("loadOrderSuccess: Unauthorized access:", {
        orderId,
        userId,
      });
      throw new Error("Unauthorized access");
    }

    res.render("order-success", {
      order,
      user: req.user || req.session.user,
    });
  } catch (error) {
    console.error("loadOrderSuccess: Error:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const getUserOrders = async (req, res) => {
  try {
    let userId;
    if (req.user) {
      userId = req.user._id.toString();
    } else if (req.session.user && req.session.user._id) {
      userId = req.session.user._id.toString();
    } else {
      console.error("getUserOrders: No authenticated user found");
      return res.redirect("/login");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error("getUserOrders: Invalid user ID:", userId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error("getUserOrders: User not found for ID:", userId);
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;
    const skip = (page - 1) * limit;

    if (isNaN(page)) {
      console.error("getUserOrders: Invalid page number:", req.query.page);
      return res
        .status(400)
        .json({ success: false, message: "Invalid page number" });
    }

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
      user,
      currentPage: page,
      totalPages,
      hasOrders: orders.length > 0,
    });
  } catch (error) {
    console.error("getUserOrders: Error fetching user orders:", error.message);
    res.redirect("/page-not-found");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log(`cancelOrder: Attempting to cancel order ID: ${orderId}`);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("cancelOrder: Invalid order ID:", orderId);
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();
    console.log(`cancelOrder: User ID: ${userId}`);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("cancelOrder: No authenticated user found");
      return res.status(401).json({ success: false, message: "No authenticated user found" });
    }

    const order = await Order.findOne({ _id: orderId, userId }).populate("order_items");
    console.log(`cancelOrder: Order found: ${!!order}`);

    if (!order) {
      console.error(`cancelOrder: Order not found for ID: ${orderId}, User ID: ${userId}`);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "Pending" && order.status !== "Processing") {
      console.error(`cancelOrder: Order cannot be cancelled, status: ${order.status}`);
      return res.status(400).json({ success: false, message: `Order cannot be cancelled in ${order.status} status` });
    }

    order.status = "Cancelled";
    await order.save();
    console.log(`cancelOrder: Order status updated to Cancelled for ID: ${orderId}`);

    for (const item of order.order_items) {
      console.log(`cancelOrder: Updating stock for product ID: ${item.productId}, Quantity: ${item.quantity}`);
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { "variants.0.stock": item.quantity },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("cancelOrder: Error cancelling order:", error.message, error.stack);
    return res.status(500).json({ success: false, message: "Internal server error while cancelling order" });
  }
};

const initiateReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log(`initiateReturn: Attempting to return order ID: ${orderId}`);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("initiateReturn: Invalid order ID:", orderId);
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();
    console.log(`initiateReturn: User ID: ${userId}`);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("initiateReturn: No authenticated user found");
      return res.status(401).json({ success: false, message: "No authenticated user found" });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    console.log(`initiateReturn: Order found: ${!!order}`);

    if (!order) {
      console.error(`initiateReturn: Order not found for ID: ${orderId}, User ID: ${userId}`);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const deliveryDate = new Date(
      order.orderDate.getTime() + 7 * 24 * 60 * 60 * 1000
    );
    if (order.status !== "Delivered" || new Date() > deliveryDate) {
      console.error(`initiateReturn: Order cannot be returned, status: ${order.status}, deliveryDate: ${deliveryDate}`);
      return res.status(400).json({ success: false, message: "Order cannot be returned" });
    }

    order.status = "Return Requested";
    await order.save();
    console.log(`initiateReturn: Order status updated to Return Requested for ID: ${orderId}`);

    return res.status(200).json({
      success: true,
      message: "Return initiated successfully",
    });
  } catch (error) {
    console.error("initiateReturn: Error initiating return:", error.message, error.stack);
    return res.status(500).json({ success: false, message: "Internal server error while initiating return" });
  }
};

const reOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log(`reOrder: Attempting to reorder order ID: ${orderId}`);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("reOrder: Invalid order ID:", orderId);
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();
    console.log(`reOrder: User ID: ${userId}`);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("reOrder: No authenticated user found");
      return res.status(401).json({ success: false, message: "No authenticated user found" });
    }

    const order = await Order.findOne({ _id: orderId, userId }).populate("order_items");
    console.log(`reOrder: Order found: ${!!order}`);

    if (!order) {
      console.error(`reOrder: Order not found for ID: ${orderId}, User ID: ${userId}`);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const newOrder = new Order({
      userId,
      paymentMethod: order.paymentMethod,
      orderDate: new Date(),
      status: "Pending",
      address: order.address,
      total: order.total,
      order_items: [],
      orderNumber: `ORD${Date.now().toString().slice(-6)}`,
    });

    await newOrder.save();
    console.log(`reOrder: New order created with ID: ${newOrder._id}`);

    const orderItems = [];
    for (const item of order.order_items) {
      const product = await Product.findById(item.productId);
      console.log(`reOrder: Checking stock for product ID: ${item.productId}, Quantity: ${item.quantity}`);
      if (!product || product.variants[0].stock < item.quantity) {
        console.error(`reOrder: Insufficient stock for ${item.product_name}`);
        throw new Error(`Insufficient stock for ${item.product_name}`);
      }

      const orderItem = new OrderItem({
        product_name: item.product_name,
        productId: item.productId,
        orderId: newOrder._id,
        size: item.size,
        price: item.price,
        quantity: item.quantity,
        total_amount: item.total_amount,
      });

      await orderItem.save();
      orderItems.push(orderItem._id);
      console.log(`reOrder: Order item created with ID: ${orderItem._id}`);

      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: { "variants.0.stock": -item.quantity },
        }
      );
      console.log(`reOrder: Stock updated for product ID: ${item.productId}`);
    }

    newOrder.order_items = orderItems;
    await newOrder.save();
    console.log(`reOrder: New order saved with items for ID: ${newOrder._id}`);

    return res.status(200).json({
      success: true,
      message: "Order placed successfully",
      redirect: `/order-success?orderId=${newOrder._id}`,
    });
  } catch (error) {
    console.error("reOrder: Error reordering:", error.message, error.stack);
    return res.status(500).json({ success: false, message: "Internal server error while reordering" });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log(`getOrderDetails: Fetching details for order ID: ${orderId}`);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("getOrderDetails: Invalid order ID:", orderId);
      return res.redirect("/page-not-found");
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();
    console.log(`getOrderDetails: User ID: ${userId}`);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("getOrderDetails: No authenticated user found");
      return res.redirect("/login");
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
      console.error(`getOrderDetails: Order not found for ID: ${orderId}, User ID: ${userId}`);
      return res.redirect("/page-not-found");
    }

    const user = await User.findById(userId);
    console.log(`getOrderDetails: Order fetched successfully for ID: ${orderId}`);

    res.render("orderDetails", { order, user: user || {} });
  } catch (error) {
    console.error("getOrderDetails: Error fetching order details:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log(`downloadInvoice: Generating invoice for order ID: ${orderId}`);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("downloadInvoice: Invalid order ID:", orderId);
      throw new Error("Invalid order ID");
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();
    console.log(`downloadInvoice: User ID: ${userId}`);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("downloadInvoice: No authenticated user found");
      throw new Error("No authenticated user found");
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: "order_items",
        populate: { path: "productId", model: "Product" },
      })
      .populate("address");

    if (!order) {
      console.error(`downloadInvoice: Order not found for ID: ${orderId}, User ID: ${userId}`);
      throw new Error("Order not found");
    }

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${order.orderNumber}.pdf`
    );
    doc.pipe(res);

    doc.fontSize(20).text("Invoice", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Order #${order.orderNumber}`);
    doc.text(`Order Date: ${order.orderDate.toLocaleDateString()}`);
    doc.text(`Customer: ${order.address.name}`);
    doc.moveDown();

    doc.text("Items:", { underline: true });
    order.order_items.forEach((item) => {
      doc.text(
        `${item.product_name} (Size: ${item.size}) - ₹${item.price} x ${item.quantity} = ₹${item.total_amount}`
      );
    });

    doc.moveDown();
    const subtotal = order.total - (order.total > 8000 ? 0 : 200);
    doc.text(`Subtotal: ₹${subtotal.toFixed(2)}`);
    doc.text(`Delivery Charge: ₹${order.total > 8000 ? 0 : 200}`);
    doc.text(`Grand Total: ₹${order.total.toFixed(2)}`, { bold: true });

    doc.end();
    console.log(`downloadInvoice: Invoice generated for order ID: ${orderId}`);
  } catch (error) {
    console.error("downloadInvoice: Error generating invoice:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const trackOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log(`trackOrder: Tracking order ID: ${orderId}`);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("trackOrder: Invalid order ID:", orderId);
      return res.redirect("/page-not-found");
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();
    console.log(`trackOrder: User ID: ${userId}`);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("trackOrder: No authenticated user found");
      return res.redirect("/login");
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
      console.error(`trackOrder: Order not found for ID: ${orderId}, User ID: ${userId}`);
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
          active: ["Pending", "Processing", "Confirmed", "Shipped", "Delivered"].includes(order.status),
        },
        {
          status: "Shipped",
          icon: "fa-box",
          date: order.status === "Shipped" || order.status === "Delivered" ? new Date().toLocaleDateString() : "-",
          active: ["Shipped", "Delivered"].includes(order.status),
        },
        {
          status: "Out for Delivery",
          icon: "fa-truck",
          date: order.status === "Delivered" ? new Date().toLocaleDateString() : "-",
          active: order.status === "Delivered",
        },
        {
          status: "Delivered",
          icon: "fa-home",
          date: order.status === "Delivered" ? new Date().toLocaleDateString() : "-",
          active: order.status === "Delivered",
        },
      ];
    }

    res.render("orderTracking", {
      order,
      user: req.user || req.session.user,
      progressWidth: getProgressWidth(order.status),
      trackingSteps,
    });
    console.log(`trackOrder: Rendered tracking page for order ID: ${orderId}`);
  } catch (error) {
    console.error("trackOrder: Error:", error.message, error.stack);
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