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
    const userId = req.user?.id || req.session.user;
    const { paymentMethod } = req.body;

    if (!userId) {
      throw new Error("User not found");
    }

    if (!paymentMethod || paymentMethod !== "COD") {
      throw new Error("Invalid payment method");
    }

    const userCart = await Cart.findOne({ userId }).populate("items.productId");

    if (!userCart || !userCart.items.length) {
      throw new Error("Cart is empty");
    }

    for (const item of userCart.items) {
      const productItem = await Product.findById(item.productId._id);

      if (!productItem || productItem.variants[0].stock < item.quantity) {
        throw new Error(`Insufficient stock for ${item.productId.name}`);
      }
    }

    const addressId = req.session.checkout?.addressId;

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
      const orderItem = new OrderItem({
        product_name: item.productId.name,
        productId: item.productId._id,
        orderId: newOrder._id,
        size: item.productId.variants?.[0]?.size || "M",
        price: item.productId.variants?.[0]?.salePrice || 0,
        quantity: item.quantity,
        total_amount:
          (item.productId.variants?.[0]?.salePrice || 0) * item.quantity,
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
    console.error("Error placing order:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const loadOrderSuccess = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    const userId = req.user?.id || req.session.user;
    const order = await Order.findById(orderId)
      .populate("address")
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
          model: "Product",
          select: "name",
        },
      });
    const user = await User.findById(userId);

    if (!order || !user || order.userId.toString() !== userId) {
      return res.redirect("/page-not-found");
    }

    res.render("order-success", { order, user });
  } catch (error) {
    console.error("Error loading order success page:", error);
    res.redirect("/page-not-found");
  }
};
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user?.id || req.session.user;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
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

    const user = await User.findById(userId);

    res.render("Orders", {
      orders,
      user: user || {},
      currentPage: page,
      totalPages,
      hasOrders: orders.length > 0,
    });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.redirect("/page-not-found");
  }
};

const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const orderId = req.params.id;
    const userId = req.user?.id || req.session.user;
    const order = await Order.findOne({ _id: orderId, userId })
      .populate("order_items")
      .session(session);

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "Pending" && order.status !== "Processing") {
      throw new Error("Order cannot be cancelled");
    }

    order.status = "Cancelled";
    await order.save({ session });

    for (const item of order.order_items) {
      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: { "variants.0.stock": item.quantity },
        },
        { session }
      );
    }

    await session.commitTransaction();
    res.redirect("/orders");
  } catch (error) {
    await session.abortTransaction();
    console.error("Error cancelling order:", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

const initiateReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user?.id || req.session.user;
    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const deliveryDate = new Date(
      order.orderDate.getTime() + 3 * 24 * 60 * 60 * 1000
    );
    if (order.status !== "Delivered" || new Date() > deliveryDate) {
      return res
        .status(400)
        .json({ success: false, message: "Order cannot be returned" });
    }

    order.status = "Return Requested";
    await order.save();

    res.redirect("/orders");
  } catch (error) {
    console.error("Error initiating return:", error);
    res.redirect("/page-not-found");
  }
};

const reOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const orderId = req.params.id;
    const userId = req.user?.id || req.session.user;
    const order = await Order.findOne({ _id: orderId, userId })
      .populate("order_items")
      .session(session);

    if (!order) {
      throw new Error("Order not found");
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

    await newOrder.save({ session });

    const orderItems = [];
    for (const item of order.order_items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product || product.variants[0].stock < item.quantity) {
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
      await orderItem.save({ session });
      orderItems.push(orderItem._id);

      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: { "variants.0.stock": -item.quantity },
        },
        { session }
      );
    }

    newOrder.order_items = orderItems;
    await newOrder.save({ session });

    await session.commitTransaction();
    res.redirect(`/order-success?orderId=${newOrder._id}`);
  } catch (error) {
    await session.abortTransaction();
    console.error("Error reordering:", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user?.id || req.session.user;
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
      return res.redirect("/page-not-found");
    }

    const user = await User.findById(userId);
    res.render("order-details", { order, user: user || {} });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.redirect("/page-not-found");
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user?.id || req.session.user;
    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: "order_items",
        populate: { path: "productId", model: "Product" },
      })
      .populate("address");

    if (!order) {
      return res.redirect("/page-not-found");
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
    console.error("Error generating invoice:", error);
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
};
