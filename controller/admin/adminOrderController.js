const mongoose = require("mongoose");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const User = require("../../model/userSchema");
const Product = require("../../model/productScheema");
const Wallet = require("../../model/walletScheema");
const { v4: uuidv4 } = require("uuid");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { processRefundToWallet } = require("../user/walletController");
const logger = require("../../utils/logger");


const updateOrderStatusHelper = async (orderId) => {
  try {
    logger.info(`Updating order status for orderId: ${orderId}`);
    const order = await Order.findById(orderId);
    if (!order) {
      logger.error(`Order not found with ID: ${orderId}`);
      return null;
    }

   
    const orderItems = await OrderItem.find({ orderId: order._id });

    if (orderItems.length === 0) {
      logger.error(`No order items found for order: ${orderId}`);
      return null;
    }


    const statusCounts = {};
    for (const item of orderItems) {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    }

    logger.info(`Status counts for order ${orderId}:`, statusCounts);
    const totalItems = orderItems.length;


    let newStatus = order.status;

    
    const allSameStatus = Object.keys(statusCounts).length === 1;
    if (allSameStatus) {
      newStatus = Object.keys(statusCounts)[0];
      logger.info(`All items have same status: ${newStatus}`);
    }

    else if (
      statusCounts["Cancelled"] &&
      statusCounts["Cancelled"] < totalItems
    ) {
      newStatus = "Partially Cancelled";
      logger.info(
        `Some items cancelled: ${statusCounts["Cancelled"]}/${totalItems}`
      );
    }
  
    else if (
      (statusCounts["Returned"] ||
        statusCounts["Return Requested"] ||
        statusCounts["Return Approved"]) &&
      (statusCounts["Returned"] || 0) +
        (statusCounts["Return Requested"] || 0) +
        (statusCounts["Return Approved"] || 0) <
        totalItems
    ) {
      newStatus = "Partially Returned";
      logger.info(`Some items in return process`);
    }
 
    else if (Object.keys(statusCounts).length > 1) {
     
      if (statusCounts["Delivered"]) {
        newStatus = "Partially Delivered";
        logger.info(`Some items delivered, others in different states`);
      }
   
      else if (statusCounts["Shipped"]) {
        newStatus = "Partially Shipped";
        logger.info(`Some items shipped, others in different states`);
      }
    }

    
    if (newStatus !== order.status) {
      logger.info(`Updating order status from ${order.status} to ${newStatus}`);
      order.status = newStatus;


      if (!Array.isArray(order.statusHistory)) {
        order.statusHistory = [];
      }

      order.statusHistory.push({
        status: newStatus,
        date: new Date(),
        note: `Status updated to ${newStatus} based on item statuses`,
      });
      await order.save();
      logger.info(`Order status updated successfully`);
    } else {
      logger.info(`Order status remains unchanged: ${order.status}`);
    }

    return newStatus;
  } catch (error) {
    logger.error("Error updating order status:", error);
    throw error;
  }
};

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
      sort === "orderNumber"
        ? "orderNumber"
        : sort === "total"
        ? "total"
        : "createdAt";

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
    logger.error("getorderController: Error fetching orders:", error);
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
      "Partially Cancelled",
      "Partially Returned",
      "Partially Delivered",
      "Partially Shipped",
    ];

    if (!validStatuses.includes(status)) {
      logger.error("updateOrderStatus: Invalid status:", status);
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
      logger.error(
        "updateOrderStatus: Order not found for ID/orderNumber:",
        orderId
      );
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }


    const finalStates = ["Cancelled", "Returned"];
    if (finalStates.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update status. Order is already in ${order.status} state which is final.`,
        isFinalState: true,
      });
    }

    const progressionStates = ["Pending", "Processing", "Confirmed", "Shipped"];
    if (order.status === "Delivered" && progressionStates.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Cannot change a delivered order back to an earlier status.",
        isDelivered: true,
      });
    }


    if (status !== order.status) {
      order.status = status;


      if (!Array.isArray(order.statusHistory)) {
        order.statusHistory = [];
      }

      order.statusHistory.push({
        status: status,
        date: new Date(),
        note: `Status updated to ${status} by admin`,
      });

      if (status === "Delivered" && !order.deliveryDate) {
        order.deliveryDate = new Date();
      }

      await order.save();


      if (!status.startsWith("Partially")) {
        const orderItems = await OrderItem.find({ orderId: order._id });


        const nonFinalStatuses = [
          "Pending",
          "Processing",
          "Confirmed",
          "Shipped",
        ];
        const finalStates = ["Cancelled", "Returned"];

        let updatedCount = 0;
        let skippedCount = 0;

        for (const item of orderItems) {

          if (finalStates.includes(item.status)) {
            logger.info(
              `Skipping item ${item._id} as it's in final state: ${item.status}`
            );
            skippedCount++;
            continue; 
          }

          
          if (
            item.status === "Delivered" &&
            progressionStates.includes(status)
          ) {
            logger.info(
              `Skipping delivered item ${item._id} - cannot move back to ${status}`
            );
            skippedCount++;
            continue;
          }

          
          if (
            status !== "Cancelled" &&
            !nonFinalStatuses.includes(item.status) &&
            !nonFinalStatuses.includes(status)
          ) {
            logger.info(
              `Skipping item ${item._id} with special status: ${item.status}`
            );
            skippedCount++;
            continue;
          }

          try {
         
            item.status = status;
            item.updatedAt = new Date();
            item.statusHistory.push({
              status: status,
              date: new Date(),
              note: `Status updated to ${status} based on order status update`,
            });

            await item.save();
            updatedCount++;
          } catch (itemError) {
            logger.error(`Error updating item ${item._id} status:`, itemError);
           
          }
        }

        logger.info(
          `Order ${orderId} status update: ${updatedCount} items updated, ${skippedCount} items skipped`
        );
      }
    }

    res.json({ success: true, message: "Order status updated successfully" });
  } catch (error) {
    logger.error("Error in updateOrderStatus:", error);
    res
      .status(500)
      .json({ success: false, message: "Server issue: " + error.message });
  }
};


const updateOrderItemStatus = async (req, res) => {
  try {
    const { orderItemId, status } = req.body;


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
      return res.status(400).json({
        success: false,
        message: `Invalid status: ${status}`,
      });
    }


    const orderItem = await OrderItem.findById(orderItemId);
    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      });
    }

    const finalStates = ["Cancelled", "Returned"];
    if (finalStates.includes(orderItem.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update status. Item is already in ${orderItem.status} state which is final.`,
        isFinalState: true,
      });
    }


    const progressionStates = ["Pending", "Processing", "Confirmed", "Shipped"];
    if (
      orderItem.status === "Delivered" &&
      progressionStates.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot change a delivered item back to an earlier status.",
        isDelivered: true,
      });
    }


    orderItem.status = status;
    orderItem.updatedAt = new Date();
    orderItem.statusHistory.push({
      status: status,
      date: new Date(),
      note: `Status updated to ${status} by admin`,
    });

    await orderItem.save();

    await updateOrderStatusHelper(orderItem.orderId);

    return res.status(200).json({
      success: true,
      message: "Order item status updated successfully",
    });
  } catch (error) {
    logger.error("Error updating order item status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update order item status: " + error.message,
    });
  }
};


const canUpdateOrderItem = async (orderItemId) => {
  try {
    const orderItem = await OrderItem.findById(orderItemId);
    if (!orderItem) {
      return { canUpdate: false, message: "Order item not found" };
    }

  
    const finalStates = ["Cancelled", "Returned"];
    if (finalStates.includes(orderItem.status)) {
      return {
        canUpdate: false,
        message: `Item is in ${orderItem.status} state and cannot be modified`,
        currentStatus: orderItem.status,
        isFinalState: true,
      };
    }

    return { canUpdate: true };
  } catch (error) {
    logger.error(
      `Error checking if order item can be updated: ${error.message}`
    );
    return { canUpdate: false, message: "Error checking item status" };
  }
};


const canUpdateOrder = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return { canUpdate: false, message: "Order not found" };
    }


    const finalStates = ["Cancelled", "Returned"];
    if (finalStates.includes(order.status)) {
      return {
        canUpdate: false,
        message: `Order is in ${order.status} state and cannot be modified`,
        currentStatus: order.status,
        isFinalState: true,
      };
    }

    return { canUpdate: true };
  } catch (error) {
    logger.error(`Error checking if order can be updated: ${error.message}`);
    return { canUpdate: false, message: "Error checking order status" };
  }
};


const checkItemUpdateability = async (req, res) => {
  try {
    const { orderItemId } = req.params;

    const orderItem = await OrderItem.findById(orderItemId);
    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      });
    }

    const canUpdate = canUpdateOrderItem(orderItem);

    return res.status(200).json({
      success: true,
      canUpdate,
      status: orderItem.status,
      isFinalState: ["Cancelled", "Returned"].includes(orderItem.status),
    });
  } catch (error) {
    logger.error("Error checking item updateability:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check item updateability: " + error.message,
    });
  }
};


const checkOrderUpdateability = async (req, res) => {
  try {
    const { orderId } = req.params;

    let order;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId);
    } else {
      order = await Order.findOne({ orderNumber: orderId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const canUpdate = canUpdateOrder(order);

    return res.status(200).json({
      success: true,
      canUpdate,
      status: order.status,
      isFinalState: ["Cancelled", "Returned"].includes(order.status),
    });
  } catch (error) {
    logger.error("Error checking order updateability:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check order updateability: " + error.message,
    });
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
      .populate("address")
      .lean();

    if (!order) {
      return res.status(404).render("page-404", { message: "Order not found" });
    }

  
    const orderItems = await OrderItem.find({ orderId: order._id })
      .populate({
        path: "productId",
        select: "name images variants",
      })
      .lean();


    const formattedItems = orderItems.map((item) => {
      return {
        _id: item._id.toString(),
        product_name:
          item.product_name ||
          (item.productId ? item.productId.name : "Unknown Product"),
        itemImage:
          item.productId &&
          item.productId.images &&
          item.productId.images.length > 0
            ? item.productId.images[0].url
            : "/api/placeholder/50/50",
        size: item.size || "N/A",
        price: item.price || 0,
        quantity: item.quantity || 1,
        total_amount: item.total_amount || 0,
        status: item.status || "Processing",
        statusHistory: item.statusHistory || [],
        refunded: item.refunded || false,
        refundAmount: item.refundAmount || 0,
        refundDate: item.refundDate,
        refundTransactionRef: item.refundTransactionRef,
        cancelReason: item.cancelReason || "",
        returnReason: item.returnReason || "",
        productId: item.productId ? item.productId._id : null,
       
        canModify: !["Cancelled", "Returned"].includes(item.status),
        isDelivered: item.status === "Delivered",
      };
    });

    const formattedOrder = {
      _id: order._id.toString(),
      orderNumber: order.orderNumber || order._id,
      orderDate: order.orderDate || order.createdAt,
      formattedDate: new Date(
        order.orderDate || order.createdAt
      ).toLocaleString("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      customer: {
        _id: order.userId ? order.userId._id : null,
        fullname: order.userId ? order.userId.fullname : "Unknown",
        email: order.userId ? order.userId.email : "N/A",
      },
      total: order.total || 0,
      paymentMethod: order.paymentMethod || "N/A",
      paymentStatus: order.paymentStatus || "Pending",
      status: order.status || "Processing",
      address: order.address || {},
      statusHistory: order.statusHistory || [],
      deliveryDate: order.deliveryDate,
      orderItems: formattedItems,

      canModify: !["Cancelled", "Returned"].includes(order.status),
    };

    res.render("adminorderDetails", { order: formattedOrder });
  } catch (error) {
    logger.error("Error in getOrderDetails:", error);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};


const approveReturnItem = async (req, res) => {
  try {
    const { orderItemId } = req.params;


    const orderItem = await OrderItem.findById(orderItemId).populate("orderId");

    if (!orderItem) {
      return res
        .status(404)
        .json({ success: false, message: "Order item not found" });
    }

   
    if (orderItem.status !== "Return Requested") {
      return res.status(400).json({
        success: false,
        message: "This item is not pending return approval",
      });
    }


    orderItem.status = "Return Approved";
    orderItem.returnApprovedDate = new Date();
    orderItem.updatedAt = new Date();
    orderItem.statusHistory.push({
      status: "Return Approved",
      date: new Date(),
      note: "Return request approved by admin",
    });
    await orderItem.save();


    await updateOrderStatusHelper(orderItem.orderId._id);

    return res.status(200).json({
      success: true,
      message: "Return request approved",
    });
  } catch (error) {
    logger.error("Error approving return for order item:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to approve return" });
  }
};


const completeReturnItem = async (req, res) => {
  try {
    logger.info(
      `completeReturnItem called for item ID: ${req.params.orderItemId}`
    );
    const { orderItemId } = req.params;

  
    const orderItem = await OrderItem.findById(orderItemId)
      .populate("orderId")
      .populate({
        path: "orderId",
        populate: { path: "userId" },
      });

    if (!orderItem) {
      logger.error(`Order item not found: ${orderItemId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order item not found" });
    }

   
    if (orderItem.status !== "Return Approved") {
      logger.error(
        `Item not in Return Approved status. Current status: ${orderItem.status}`
      );
      return res.status(400).json({
        success: false,
        message: "This item is not approved for return",
      });
    }

   
    if (orderItem.refunded) {
      logger.error(`Item already refunded: ${orderItemId}`);
      return res.status(400).json({
        success: false,
        message: "This item has already been refunded",
      });
    }

    const order = orderItem.orderId;
    const userId = order.userId?._id;

    if (!userId) {
      logger.error(`User ID not found in order`);
      return res.status(400).json({
        success: false,
        message: "Cannot process refund: User ID not found",
      });
    }

   
    orderItem.status = "Returned";
    orderItem.returnCompletedDate = new Date();
    orderItem.updatedAt = new Date();
    orderItem.statusHistory.push({
      status: "Returned",
      date: new Date(),
      note: "Return completed by admin",
    });
    await orderItem.save();
    logger.info(`Order item status updated to Returned`);

  
    const product = await Product.findById(orderItem.productId);
    if (product) {
      const variantIndex = product.variants.findIndex(
        (v) => v.size === orderItem.size
      );
      if (variantIndex !== -1) {
        logger.info(
          `Restoring stock for product: ${product.name}, size: ${orderItem.size}, quantity: ${orderItem.quantity}`
        );
        product.variants[variantIndex].varientquatity += orderItem.quantity;
        await product.save();
        logger.info(`Stock restored successfully`);
      } else {
        logger.error(`Product variant not found for size: ${orderItem.size}`);
      }
    } else {
      logger.error(`Product not found: ${orderItem.productId}`);
    }


    let refundAmount = 0;
    if (
      typeof orderItem.total_amount === "number" &&
      !isNaN(orderItem.total_amount)
    ) {
      refundAmount = orderItem.total_amount;
    } else if (
      typeof orderItem.price === "number" &&
      !isNaN(orderItem.price) &&
      typeof orderItem.quantity === "number" &&
      !isNaN(orderItem.quantity)
    ) {
      refundAmount = orderItem.price * orderItem.quantity;
    }

    if (refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid refund amount: Amount must be greater than zero",
      });
    }

    logger.info(`Calculated refund amount: ${refundAmount}`);

    try {
   
      const refundResult = await processRefundToWallet(
        userId,
        refundAmount,
        order.orderNumber || order._id,
        `Refund for returned item: ${orderItem.product_name}`
      );

      if (!refundResult.success) {
        logger.error(`Refund processing failed:`, refundResult.message);
        return res.status(500).json({
          success: false,
          message: `Failed to process refund: ${refundResult.message}`,
        });
      }

      logger.info(`Refund processed successfully:`, refundResult);

   
      orderItem.refunded = true;
      orderItem.refundAmount = refundAmount;
      orderItem.refundDate = new Date();
      orderItem.refundTransactionRef = refundResult.transactionRef;
      await orderItem.save();
      logger.info(`Item marked as refunded`);

    
      await updateOrderStatusHelper(order._id);
      logger.info(`Parent order status updated`);


      const user = await User.findById(userId);
      const userName = user ? user.fullname : "Customer";

      return res.status(200).json({
        success: true,
        message: "Return completed and refund processed",
        refundAmount: refundAmount,
        walletBalance: refundResult.walletBalance,
        userName: userName,
        transactionRef: refundResult.transactionRef,
      });
    } catch (error) {
      logger.error(`Failed to process refund:`, error);
      return res.status(500).json({
        success: false,
        message: "Failed to process refund: " + error.message,
      });
    }
  } catch (error) {
    logger.error("Error completing return for order item:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to complete return" });
  }
};


const rejectReturnItem = async (req, res) => {
  try {
    const { orderItemId } = req.params;
    const { rejectReason } = req.body;

    if (!rejectReason) {
      return res
        .status(400)
        .json({ success: false, message: "Rejection reason is required" });
    }


    const orderItem = await OrderItem.findById(orderItemId).populate("orderId");

    if (!orderItem) {
      return res
        .status(404)
        .json({ success: false, message: "Order item not found" });
    }


    if (orderItem.status !== "Return Requested") {
      return res.status(400).json({
        success: false,
        message: "This item is not pending return approval",
      });
    }

   
    orderItem.status = "Return Rejected";
    orderItem.rejectReason = rejectReason;
    orderItem.updatedAt = new Date();
    orderItem.statusHistory.push({
      status: "Return Rejected",
      date: new Date(),
      note: `Return request rejected by admin. Reason: ${rejectReason}`,
    });
    await orderItem.save();

   
    await updateOrderStatusHelper(orderItem.orderId._id);

    return res.status(200).json({
      success: true,
      message: "Return request rejected",
    });
  } catch (error) {
    logger.error("Error rejecting return for order item:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reject return" });
  }
};

const manageReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { action, rejectionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      logger.error("manageReturn: Invalid order ID:", orderId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    if (!["approve", "reject"].includes(action)) {
      logger.error("manageReturn: Invalid action:", action);
      return res
        .status(400)
        .json({ success: false, message: "Invalid action" });
    }

    if (
      action === "reject" &&
      (!rejectionReason || rejectionReason.trim() === "")
    ) {
      logger.error("manageReturn: Rejection reason is required");
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
      logger.error(`manageReturn: Order not found for ID: ${orderId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.refunded) {
      logger.error(
        `manageReturn: Refund already processed for order ID: ${orderId}`
      );
      return res.status(400).json({
        success: false,
        message: "Refund already processed for this order",
      });
    }

    if (action === "approve") {
      if (order.status !== "Return Requested") {
        logger.error(
          `manageReturn: Cannot approve return, current status: ${order.status}`
        );
        return res.status(400).json({
          success: false,
          message: `Cannot approve return for order in ${order.status} status`,
        });
      }

    
      if (!order.order_items || order.order_items.length === 0) {
        logger.error(
          `manageReturn: No valid order items found for order ID: ${orderId}`
        );
        return res.status(400).json({
          success: false,
          message: "No valid order items found for refund",
        });
      }

      for (const item of order.order_items) {
        if (
          !item.productId ||
          !mongoose.Types.ObjectId.isValid(item.productId)
        ) {
          logger.error(
            `manageReturn: Invalid product ID in order item: ${JSON.stringify(
              item
            )}`
          );
          return res.status(400).json({
            success: false,
            message: `Invalid product ID in order item: ${item._id}`,
          });
        }
        if (!item.quantity || item.quantity <= 0) {
          logger.error(
            `manageReturn: Invalid quantity in order item: ${JSON.stringify(
              item
            )}`
          );
          return res.status(400).json({
            success: false,
            message: `Invalid quantity in order item: ${item._id}`,
          });
        }
        if (!item.size) {
          logger.error(
            `manageReturn: Missing size in order item: ${JSON.stringify(item)}`
          );
          return res.status(400).json({
            success: false,
            message: `Missing size in order item: ${item._id}`,
          });
        }
      }

   
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: "Return Approved" },
        { new: true }
      );

      if (!updatedOrder) {
        logger.error(
          `manageReturn: Failed to update order status to Return Approved for ID: ${orderId}`
        );
        return res.status(500).json({
          success: false,
          message: "Failed to update order status to Return Approved",
        });
      }

      try {
        const refundResult = await processRefund(updatedOrder);

        if (!refundResult.success) {
          logger.error(
            `manageReturn: Refund processing failed:`,
            refundResult.message
          );
  
          await Order.findByIdAndUpdate(orderId, {
            status: "Return Requested",
          });
          return res.status(500).json({
            success: false,
            message: `Failed to process refund: ${refundResult.message}`,
          });
        }

        updatedOrder.refunded = true;
        updatedOrder.status = "Returned";
        await updatedOrder.save();

        return res.status(200).json({
          success: true,
          message: "Return approved and refund processed successfully",
          refundAmount: refundResult.amount,
          walletBalance: refundResult.walletBalance,
          transactionRef: refundResult.transactionRef,
        });
      } catch (error) {
        logger.error(
          "manageReturn: Failed to process refund, rolling back status for order ID:",
          orderId,
          error.message,
          error.stack
        );

        await Order.findByIdAndUpdate(orderId, { status: "Return Requested" });
        return res.status(500).json({
          success: false,
          message: `Failed to process refund: ${error.message}`,
        });
      }
    } else {
      if (order.status !== "Return Requested") {
        logger.error(
          `manageReturn: Cannot reject return, current status: ${order.status}`
        );
        return res.status(400).json({
          success: false,
          message: `Cannot reject return for order in ${order.status} status`,
        });
      }


      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: "Return Rejected", returnRejectionReason: rejectionReason },
        { new: true }
      );

      if (!updatedOrder) {
        logger.error(
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
    logger.error(
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
    logger.info(`processRefund called for order: ${order._id}`);

    if (!order.order_items || order.order_items.length === 0) {
      logger.error(`No order items found for refund`);
      throw new Error("No order items found for refund");
    }

    let totalRefundAmount = 0;
    let processedItems = 0;
    let skippedItems = 0;

 
    logger.info(`Order items details:`);
    for (const item of order.order_items) {
      logger.info(`Item ${item._id} details:`, {
        productId: item.productId,
        price: item.price,
        quantity: item.quantity,
        total_amount: item.total_amount,
        size: item.size,
      });
    }

    for (const item of order.order_items) {

      if (item.refunded) {
        logger.info(`Skipping already refunded item: ${item._id}`);
        skippedItems++;
        continue;
      }


      if (!item.productId) {
        logger.warn(
          `Item ${item._id} has undefined productId, attempting to find product by name`
        );

       
        if (item.product_name) {
          const product = await Product.findOne({ name: item.product_name });
          if (product) {
            logger.info(
              `Found product by name: ${item.product_name}, ID: ${product._id}`
            );
            item.productId = product._id;
          }
        }

        if (!item.productId) {
          logger.warn(
            `Skipping item ${item._id} with undefined productId and no product name`
          );
          skippedItems++;
          continue;
        }
      }

      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        logger.warn(
          `Skipping item ${item._id} with invalid product ID: ${item.productId}`
        );
        skippedItems++;
        continue;
      }

 
      const quantity = Number(item.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        logger.warn(
          `Skipping item ${item._id} with invalid quantity: ${item.quantity}`
        );
        skippedItems++;
        continue;
      }


      if (!item.size) {
        logger.warn(
          `Item ${item._id} missing size, using 'default' as fallback`
        );
        item.size = "default";
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        logger.warn(
          `Product not found for ID: ${item.productId}, skipping item ${item._id}`
        );
        skippedItems++;
        continue;
      }

     
      let variantIndex = product.variants.findIndex(
        (v) => v.size === item.size
      );
      if (variantIndex === -1) {
        logger.warn(
          `Variant with size ${item.size} not found for product ID: ${item.productId}`
        );
        if (product.variants && product.variants.length > 0) {
          variantIndex = 0;
          logger.info(
            `Using first available variant as fallback: ${product.variants[0].size}`
          );
        } else {
          logger.warn(
            `No variants available for product, skipping item ${item._id}`
          );
          skippedItems++;
          continue;
        }
      }

     
      logger.info(
        `Restoring stock for product: ${product.name}, size: ${item.size}, quantity: ${quantity}`
      );
      product.variants[variantIndex].varientquatity += quantity;
      await product.save();
      logger.info(`Stock restored successfully`);


      let itemRefundAmount = 0;


      if (
        typeof item.total_amount === "number" &&
        !isNaN(item.total_amount) &&
        item.total_amount > 0
      ) {
        itemRefundAmount = item.total_amount;
        logger.info(`Using item.total_amount for refund: ${itemRefundAmount}`);
      }
 
      else if (
        typeof item.price === "number" &&
        !isNaN(item.price) &&
        item.price > 0 &&
        quantity > 0
      ) {
        itemRefundAmount = item.price * quantity;
        logger.info(
          `Calculated refund from price * quantity: ${item.price} * ${quantity} = ${itemRefundAmount}`
        );
      }
   
      else if (product.price && !isNaN(product.price) && product.price > 0) {
        itemRefundAmount = product.price * quantity;
        logger.info(
          `Using product price as fallback: ${product.price} * ${quantity} = ${itemRefundAmount}`
        );
      }

      if (itemRefundAmount > 0) {
        totalRefundAmount += itemRefundAmount;
        processedItems++;
        logger.info(
          `Added ${itemRefundAmount} to refund total. Current total: ${totalRefundAmount}`
        );
      } else {
        logger.warn(
          `Skipping item ${item._id} due to invalid refund amount calculation`
        );
        skippedItems++;
      }
    }

   
    if (processedItems === 0) {
      if (
        typeof order.total === "number" &&
        !isNaN(order.total) &&
        order.total > 0
      ) {
        totalRefundAmount = order.total;
        logger.info(
          `No valid items processed. Using order.total as refund amount: ${totalRefundAmount}`
        );
      } else {
        throw new Error(
          "Could not calculate a valid refund amount for any items and order total is invalid"
        );
      }
    }

    if (isNaN(totalRefundAmount) || totalRefundAmount <= 0) {
      throw new Error(
        "Invalid refund amount: Amount must be greater than zero"
      );
    }

    logger.info(
      `Final refund amount: ${totalRefundAmount} (Processed: ${processedItems}, Skipped: ${skippedItems})`
    );


    const userId = order.userId;
    const refundResult = await processRefundToWallet(
      userId,
      totalRefundAmount,
      order.orderNumber || order._id,
      `Refund for order`
    );

    if (!refundResult.success) {
      throw new Error(`Failed to process refund: ${refundResult.message}`);
    }

    logger.info(`Refund processed successfully:`, refundResult);


    for (const item of order.order_items) {

      if (item.refunded) {
        continue;
      }

      const orderItem = await OrderItem.findById(item._id);
      if (!orderItem) {
        logger.warn(
          `Order item not found: ${item._id}, skipping refund marking`
        );
        continue;
      }


      let itemRefundAmount = 0;
      if (
        typeof item.total_amount === "number" &&
        !isNaN(item.total_amount) &&
        item.total_amount > 0
      ) {
        itemRefundAmount = item.total_amount;
      } else if (
        typeof item.price === "number" &&
        !isNaN(item.price) &&
        item.price > 0 &&
        typeof item.quantity === "number" &&
        !isNaN(item.quantity) &&
        item.quantity > 0
      ) {
        itemRefundAmount = item.price * item.quantity;
      } else {
       
        const totalItems = order.order_items.length;
        if (totalItems > 0) {
          itemRefundAmount = totalRefundAmount / totalItems;
          logger.info(
            `Using proportional refund for item ${item._id}: ${itemRefundAmount}`
          );
        }
      }

      
      if (itemRefundAmount > 0) {
        orderItem.refunded = true;
        orderItem.refundAmount = itemRefundAmount;
        orderItem.refundDate = new Date();
        orderItem.refundTransactionRef = refundResult.transactionRef;
        orderItem.status = "Returned";
        orderItem.statusHistory.push({
          status: "Returned",
          date: new Date(),
          note: `Item returned and refunded. Amount: ₹${itemRefundAmount.toFixed(
            2
          )}`,
        });
        await orderItem.save();
        logger.info(
          `Order item ${orderItem._id} marked as refunded with amount: ${itemRefundAmount}`
        );
      } else {
        logger.info(
          `Skipping order item ${orderItem._id} due to invalid refund amount`
        );
      }
    }

    return {
      success: true,
      amount: totalRefundAmount,
      walletBalance: refundResult.walletBalance,
      transactionRef: refundResult.transactionRef,
      processedItems,
      skippedItems,
    };
  } catch (error) {
    logger.error(
      "processRefund: Error processing refund for order ID:",
      order._id,
      error.message,
      error.stack
    );
    return {
      success: false,
      message: error.message || "Failed to process refund",
    };
  }
};

const admindownloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;

  
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      logger.error("downloadInvoice: Invalid order ID:", orderId);
      return res.status(400).json({ error: "Invalid order ID" });
    }


    const order = await Order.findById(orderId)
      .populate({
        path: "order_items",
        populate: { path: "productId", model: "Product" },
      })
      .populate("address");

    if (!order) {
      logger.error(`downloadInvoice: Order not found for ID: ${orderId}`);
      return res.status(404).json({ error: "Order not found" });
    }


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

  
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-ORD${order.orderNumber || order._id}.pdf`
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
      { label: "Invoice #", value: `ORD${order.orderNumber || order._id}` },
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
        ).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
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

    const items = order.order_items.map((item) => ({
      description: `${item.productId?.name || "Unknown Product"} (Size: ${
        item.size || "N/A"
      })`,
      quantity: item.quantity || 1,
      price: item.price || 0,
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

    const grandTotal = subtotal;

    const totals = [
      { label: "Subtotal", value: subtotal.toFixed(2), bold: true },
      { label: "Grand Total", value: grandTotal.toFixed(2), bold: true },
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
        {
          width: 500,
          align: "center",
        }
      );

    doc.end();
  } catch (error) {
    logger.error("downloadInvoice Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


module.exports = {
  getorderController,
  updateOrderStatus,
  updateOrderItemStatus,
  getOrderDetails,
  manageReturn,
  admindownloadInvoice,
  approveReturnItem,
  completeReturnItem,
  rejectReturnItem,
  processRefund,
  checkItemUpdateability,
  checkOrderUpdateability,
  canUpdateOrderItem,
  canUpdateOrder,
};
