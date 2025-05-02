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

<<<<<<< Updated upstream
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;
    const skip = (page - 1) * limit;
=======
    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "name images variants",
    });

    if (!cart || cart.items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Your cart is empty" });
    }

    for (const item of cart.items) {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      if (!variant) {
        return res.status(400).json({
          success: false,
          message: `Invalid variant for product ${item.productId.name}`,
        });
      }
      if (variant.varientquatity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${variant.varientquatity} units of ${item.productId.name} (${item.size}) are available`,
        });
      }
    }

    let totalPrice = 0;
    for (const item of cart.items) {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      totalPrice += variant.salePrice * item.quantity;
    }

    const deliveryCharge = totalPrice > 8000 ? 0 : 200;
    let grandTotal = totalPrice + deliveryCharge;

    let discount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({ coupencode: couponCode });
      if (!coupon) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid coupon code" });
      }

      const now = new Date();
      if (
        now < new Date(coupon.startingDate) ||
        now > new Date(coupon.expiryDate)
      ) {
        return res.status(400).json({
          success: false,
          message: "Coupon is not valid at this time",
        });
      }

      if (totalPrice < coupon.minimumPurchase) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${coupon.minimumPurchase} required for this coupon`,
        });
      }

      const userUsage = coupon.usedBy.find(
        (usage) => usage.userId.toString() === userId.toString()
      );
      if (userUsage && userUsage.usageCount >= coupon.limit) {
        return res.status(400).json({
          success: false,
          message: "You have already used this coupon",
        });
      }

      discount = (totalPrice * coupon.couponpercent) / 100;
      if (discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }

      grandTotal -= discount;
      appliedCoupon = coupon;
    }

    const addressId = req.session.checkout?.addressId;
    if (!addressId) {
      return res
        .status(400)
        .json({ success: false, message: "Delivery address not selected" });
    }

    if (paymentMethod === "Wallet") {
      if (user.walletBalance === undefined) {
        user.walletBalance = 0;
        await user.save();
      }

      if (user.walletBalance < grandTotal) {
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }
    }

    const orderNumber = generateOrderNumber();
    const newOrder = new Order({
      userId: userId,
      orderNumber,
      paymentMethod,
      address: addressId,
      total: grandTotal,
      discount: discount,
      paymentStatus: paymentMethod === "COD" ? "Pending" : "Paid",
      orderDate: new Date(),
      status: "Processing",
      statusHistory: [
        {
          status: "Processing",
          date: new Date(),
          note: "Order placed successfully",
        },
      ],
    });

    await newOrder.save();

    const orderItems = [];
    for (const item of cart.items) {
      const variant = item.productId.variants.find((v) => v.size === item.size);
      const orderItem = new OrderItem({
        productId: item.productId._id,
        orderId: newOrder._id,
        product_name: item.productId.name,
        quantity: item.quantity,
        size: item.size,
        price: variant.salePrice,
        total_amount: variant.salePrice * item.quantity,
        itemImage:
          item.productId.images && item.productId.images.length > 0
            ? item.productId.images[0].url
            : null,
        status: "Processing",
        statusHistory: [
          {
            status: "Processing",
            date: new Date(),
            note: "Order item created",
          },
        ],
      });
      await orderItem.save();
      orderItems.push(orderItem._id);
    }

    newOrder.order_items = orderItems;
    await newOrder.save();

    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id);
      if (product) {
        const variantIndex = product.variants.findIndex(
          (v) => v.size === item.size
        );
        if (variantIndex !== -1) {
          product.variants[variantIndex].varientquatity -= item.quantity;
          await product.save();
        }
      }
    }

    if (appliedCoupon) {
      const userIndex = appliedCoupon.usedBy.findIndex(
        (usage) => usage.userId.toString() === userId.toString()
      );
      if (userIndex !== -1) {
        appliedCoupon.usedBy[userIndex].usageCount += 1;
      } else {
        appliedCoupon.usedBy.push({ userId, usageCount: 1 });
      }
      await appliedCoupon.save();
    }

    if (paymentMethod === "Wallet") {
      user.walletBalance -= grandTotal;
      await user.save();

      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({
          userId,
          amount: 0,
          transactions: [],
        });
      }

      wallet.transactions.push({
        amount: grandTotal,
        type: "debit",
        description: `Payment for order #${orderNumber}`,
        transactionRef: generateTransactionId(),
        date: new Date(),
      });
      await wallet.save();
    }

    await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

    delete req.session.checkout;

    req.session.lastOrderId = newOrder._id;

    return res.status(200).json({
      success: true,
      message: "Order placed successfully",
      redirect: "/order-success",
    });
  } catch (error) {
    console.error("Error placing order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to place order. Please try again.",
    });
  }
};

const loadOrderSuccess = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.session.lastOrderId;

    if (!orderId) {
      return res.redirect("/orders");
    }

    const order = await Order.findById(orderId)
      .populate("userId") 
      .populate("address") 
      .populate({
        path: "order_items", 
        populate: {
          path: "productId", 
          select: "name", 
        },
      });

    if (!order) {
      return res.redirect("/orders");
    }

    const user = await User.findById(userId);

    res.render("order-success", {
      title: "Order Success",
      user,
      order,
      page: "order-success",
    });

    delete req.session.lastOrderId;
  } catch (error) {
    console.error("Error loading order success page:", error);
    res.redirect("/orders");
  }
};


const getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login");
    }

   
    const totalOrders = await Order.countDocuments({ userId });
    const totalPages = Math.ceil(totalOrders / limit);

>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
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
=======
    console.log(`Found ${orders.length} orders for user ${userId}`);
    

    orders.forEach(order => {
      console.log(`Order ${order._id}: Payment Method: ${order.paymentMethod}, Payment Status: ${order.paymentStatus}, Status: ${order.status}`);
    });

   
    const ordersWithProgress = orders.map((order) => {
 
      if (order.paymentMethod === 'Online' && 
          (order.paymentStatus === 'Failed' || order.paymentStatus === 'Pending')) {
        console.log(`Order ${order._id} has failed/pending payment status`);
        return { ...order.toObject(), progressWidth: 0 };
      }

      // Determine progress width based on order status
      let progressWidth = 0;
      switch (order.status) {
        case "Pending":
          progressWidth = 20;
          break;
        case "Processing":
          progressWidth = 40;
          break;
        case "Shipped":
          progressWidth = 60;
          break;
        case "Out for Delivery":
          progressWidth = 80;
          break;
        case "Delivered":
        case "Returned":
          progressWidth = 100;
          break;
        case "Cancelled":
        case "Return Rejected":
          progressWidth = 100;
          break;
        case "Return Requested":
          progressWidth = 70;
          break;
        case "Return Approved":
          progressWidth = 85;
          break;
        case "Partially Cancelled":
        case "Partially Returned":
        case "Partially Delivered":
        case "Partially Shipped":
          progressWidth = 75;
          break;
        default:
          progressWidth = 0;
      }
      return { ...order.toObject(), progressWidth };
    });

    // Render the orders view with necessary data
    res.render("orders", {
      title: "My Orders",
      user,
>>>>>>> Stashed changes
      orders: ordersWithProgress,
      user,
      currentPage: page,
      totalPages,
<<<<<<< Updated upstream
      hasOrders: orders.length > 0,
=======
      page: "orders",
    });
  } catch (error) {
    console.error("Error getting user orders:", error);
    res.redirect("/");
  }
};
const getOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({
      _id: orderId,
      userId,
    })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
        },
      })
      .populate("address");

    if (!order) {
      return res.redirect("/orders");
    }

    const orderItems = await OrderItem.find({ orderId: order._id }).populate(
      "productId"
    );

    res.render("orderDetails", {
      title: "Order Details",
      user,
      order,
      orderItems,
      page: "order-details",
    });
  } catch (error) {
    console.error("Error getting order details:", error);
    res.redirect("/orders");
  }
};

const trackOrder = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id;
    const orderId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({
      _id: orderId,
      userId,
    })
      .populate({
        path: "order_items",
        populate: {
          path: "productId",
        },
      })
      .populate("address");

    if (!order) {
      return res.redirect("/orders");
    }

    let trackingSteps = [];
    let progressWidth = 0;

    if (order.status === "Cancelled") {
      trackingSteps = [
        {
          status: "Order Placed",
          date: order.orderDate.toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
        },
        {
          status: "Cancelled",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-times-circle",
          active: true,
        },
      ];
      progressWidth = 100;
    } else if (
      order.status === "Return Requested" ||
      order.status === "Return Approved" ||
      order.status === "Returned" ||
      order.status === "Return Rejected"
    ) {
      trackingSteps = [
        {
          status: "Order Placed",
          date: order.orderDate.toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
        },
        {
          status: "Processing",
          date: new Date(
            order.orderDate.getTime() + 86400000
          ).toLocaleDateString(),
          icon: "fa-cog",
          active: true,
        },
        {
          status: "Shipped",
          date: new Date(
            order.orderDate.getTime() + 172800000
          ).toLocaleDateString(),
          icon: "fa-truck",
          active: true,
        },
        {
          status: "Delivered",
          date: new Date(
            order.orderDate.getTime() + 432000000
          ).toLocaleDateString(),
          icon: "fa-check-circle",
          active: true,
        },
      ];

      if (order.status === "Return Requested") {
        trackingSteps.push({
          status: "Return Requested",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-undo-alt",
          active: true,
        });
        progressWidth = 70;
      } else if (order.status === "Return Approved") {
        trackingSteps.push({
          status: "Return Requested",
          date: new Date(
            order.updatedAt.getTime() - 86400000
          ).toLocaleDateString(),
          icon: "fa-undo-alt",
          active: true,
        });
        trackingSteps.push({
          status: "Return Approved",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-check",
          active: true,
        });
        progressWidth = 85;
      } else if (order.status === "Returned") {
        trackingSteps.push({
          status: "Return Requested",
          date: new Date(
            order.updatedAt.getTime() - 172800000
          ).toLocaleDateString(),
          icon: "fa-undo-alt",
          active: true,
        });
        trackingSteps.push({
          status: "Return Approved",
          date: new Date(
            order.updatedAt.getTime() - 86400000
          ).toLocaleDateString(),
          icon: "fa-check",
          active: true,
        });
        trackingSteps.push({
          status: "Returned",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-box",
          active: true,
        });
        progressWidth = 100;
      } else if (order.status === "Return Rejected") {
        trackingSteps.push({
          status: "Return Requested",
          date: new Date(
            order.updatedAt.getTime() - 86400000
          ).toLocaleDateString(),
          icon: "fa-undo-alt",
          active: true,
        });
        trackingSteps.push({
          status: "Return Rejected",
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-times-circle",
          active: true,
        });
        progressWidth = 100;
      }
    } else if (
      order.status === "Partially Cancelled" ||
      order.status === "Partially Returned" ||
      order.status === "Partially Delivered" ||
      order.status === "Partially Shipped"
    ) {
      trackingSteps = [
        {
          status: "Order Placed",
          date: order.orderDate.toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
        },
        {
          status: "Processing",
          date: new Date(
            order.orderDate.getTime() + 86400000
          ).toLocaleDateString(),
          icon: "fa-cog",
          active: true,
        },
        {
          status: order.status,
          date: order.updatedAt.toLocaleDateString(),
          icon: "fa-random",
          active: true,
          note: "Some items have different statuses. Check order details for more information.",
        },
      ];
      progressWidth = 75;
    } else {
      trackingSteps = [
        {
          status: "Order Placed",
          date: order.orderDate.toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
        },
        {
          status: "Processing",
          date:
            order.status === "Pending"
              ? "Pending"
              : new Date(
                  order.orderDate.getTime() + 86400000
                ).toLocaleDateString(),
          icon: "fa-cog",
          active: order.status !== "Pending",
        },
        {
          status: "Shipped",
          date:
            order.status === "Pending" || order.status === "Processing"
              ? "Pending"
              : new Date(
                  order.orderDate.getTime() + 172800000
                ).toLocaleDateString(),
          icon: "fa-truck",
          active: order.status !== "Pending" && order.status !== "Processing",
        },
        {
          status: "Out for Delivery",
          date:
            order.status === "Pending" ||
            order.status === "Processing" ||
            order.status === "Shipped"
              ? "Pending"
              : new Date(
                  order.orderDate.getTime() + 345600000
                ).toLocaleDateString(),
          icon: "fa-truck-loading",
          active:
            order.status === "Out for Delivery" || order.status === "Delivered",
        },
        {
          status: "Delivered",
          date:
            order.status === "Delivered"
              ? new Date(
                  order.orderDate.getTime() + 432000000
                ).toLocaleDateString()
              : "Pending",
          icon: "fa-check-circle",
          active: order.status === "Delivered",
        },
      ];

      switch (order.status) {
        case "Pending":
          progressWidth = 20;
          break;
        case "Processing":
          progressWidth = 40;
          break;
        case "Shipped":
          progressWidth = 60;
          break;
        case "Out for Delivery":
          progressWidth = 80;
          break;
        case "Delivered":
          progressWidth = 100;
          break;
        default:
          progressWidth = 0;
      }
    }

    res.render("orderTracking", {
      title: "Track Order",
      user,
      order,
      trackingSteps,
      progressWidth,
      page: "order-tracking",
>>>>>>> Stashed changes
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

    const userId = req.user?._id.toString() || req.session.user?._id.toString();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("initiateReturn: No authenticated user found");
      return res.status(401).json({
        success: false,
        message: "Please log in to initiate a return",
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
        `initiateReturn: Failed to update order status for ID: ${orderId}. Possible reasons: status changed, refunded=true, or query mismatch`
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
        .json({ success: false, message: "Please log in to reorder" });
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
      { label: "Invoice #", value: `ORD${order.orderNumber}` },
      { 
        label: "Date", 
        value: new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      },
      { label: "Due Date", value: new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString("en-US") }
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
    
    const items = [
      { description: "Solid Merino Wool Shirt (Size: S)", quantity: 1, price: 16770.00 },
      { description: "Solid Signature Twill Shirt (Size: S)", quantity: 1, price: 15727.00 }
    ];
    
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
      { label: "Subtotal", value: subtotal.toFixed(2), bold: true }
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
