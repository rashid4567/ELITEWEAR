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

    const order = await Order.findById(orderId)
      .populate("order_items")
      .populate("address")
      .lean();

    if (!order) {
      throw new Error("Order not found");
    }

    const userId = req.user?._id.toString() || req.session.user?._id;
    if (order.userId.toString() !== userId) {
      throw new Error("Unauthorized access");
    }

    res.render("order-success", {
      order,
      user: req.user || req.session.user,
    });
  } catch (error) {
    console.error("loadOrderSuccess Error:", error.message);
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
      return res.redirect("/login");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

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
      user,
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

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(401)
        .json({ success: false, message: "No authenticated user found" });
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
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server error while cancelling order",
      });
  }
};

const initiateReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { returnReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("initiateReturn: Invalid order ID:", orderId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    if (!returnReason || returnReason.trim() === "") {
      console.error("initiateReturn: Return reason is required");
      return res
        .status(400)
        .json({
          success: false,
          message: "Please provide a reason for the return",
        });
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("initiateReturn: No authenticated user found");
      return res
        .status(401)
        .json({
          success: false,
          message: "Please log in to initiate a return",
        });
    }

    const order = await Order.findOne({ _id: orderId, userId }).select(
      "status userId refunded deliveryDate orderDate"
    );

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
    const returnWindowDays = 90;
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
        `initiateReturn: Failed to update order status for ID: ${orderId}. Possible reasons: status changed, refunded=true, or query mismatch`
      );

      const currentOrder = await Order.findById(orderId).select(
        "status refunded"
      );

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
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("reOrder: Invalid order ID:", orderId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("reOrder: No authenticated user found");
      return res
        .status(401)
        .json({ success: false, message: "No authenticated user found" });
    }

    const order = await Order.findOne({ _id: orderId, userId }).populate(
      "order_items"
    );

    if (!order) {
      console.error(
        `reOrder: Order not found for ID: ${orderId}, User ID: ${userId}`
      );
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
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

    const orderItems = [];
    for (const item of order.order_items) {
      const product = await Product.findById(item.productId);

      const variant = product.variants.find((v) => v.size === item.size);
      if (!product || !variant || variant.variantQuantity < item.quantity) {
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

      const variantIndex = product.variants.findIndex(
        (v) => v.size === item.size
      );
      product.variants[variantIndex].variantQuantity -= item.quantity;
      await product.save();
    }

    newOrder.order_items = orderItems;
    await newOrder.save();

    return res.status(200).json({
      success: true,
      message: "Order placed successfully",
      redirect: `/order-success?orderId=${newOrder._id}`,
    });
  } catch (error) {
    console.error("reOrder Error:", error.message, error.stack);
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server error while reordering",
      });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("getOrderDetails: Invalid order ID:", orderId);
      return res.redirect("/page-not-found");
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();

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
      console.error(
        `getOrderDetails: Order not found for ID: ${orderId}, User ID: ${userId}`
      );
      return res.redirect("/page-not-found");
    }

    const user = await User.findById(userId);

    res.render("orderDetails", { order, user: user || {} });
  } catch (error) {
    console.error("getOrderDetails Error:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("downloadInvoice: Invalid order ID:", orderId);
      throw new Error("Invalid order ID");
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();

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
      console.error(
        `downloadInvoice: Order not found for ID: ${orderId}, User ID: ${userId}`
      );
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
  } catch (error) {
    console.error("downloadInvoice Error:", error.message, error.stack);
    res.redirect("/page-not-found");
  }
};

const trackOrder = async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error("trackOrder: Invalid order ID:", orderId);
      return res.redirect("/page-not-found");
    }

    const userId = req.user?._id.toString() || req.session.user?._id.toString();

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
      user: req.user || req.session.user,
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
