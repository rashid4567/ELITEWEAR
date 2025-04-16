const mongoose = require("mongoose");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const User = require("../../model/userSchema");
const Product = require("../../model/productScheema");

const getorderController = async (req, res) => {
    try {
        const { status, search, page = 1, limit = 10, sort = "createdAt", order: sortOrder = "desc", timeRange } = req.query;
        let query = {};

        if (status && status !== "All") {
            query.status = status;
        }

        if (search) {
            const users = await User.find({
                $or: [
                    { fullname: { $regex: search, $options: "i" } }, 
                    { email: { $regex: search, $options: "i" } },
                ],
            }).select("_id");
            const userIds = users.map((user) => user._id);
            query.$or = [
                { orderNumber: { $regex: search, $options: "i" } },
                { userId: { $in: userIds } },
            ];
        }

        if (timeRange) {
            const now = new Date();
            let startDate;
            switch (timeRange) {
                case "24h":
                    startDate = new Date(now.setHours(now.getHours() - 24));
                    break;
                case "7d":
                    startDate = new Date(now.setDate(now.getDate() - 7));
                    break;
                case "30d":
                    startDate = new Date(now.setDate(now.getDate() - 30));
                    break;
                case "12m":
                    startDate = new Date(now.setFullYear(now.getFullYear() - 1));
                    break;
                default:
                    break;
            }
            if (startDate) {
                query.createdAt = { $gte: startDate };
            }
        }

        const sortOptions = {};
        sortOptions[sort] = sortOrder === "desc" ? -1 : 1;

        const skip = (page - 1) * limit;

        const orders = await Order.find(query)
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
            .sort(sortOptions)
            .skip(skip)
            .limit(Number(limit))
            .lean();

        const totalOrders = await Order.countDocuments(query);

        const formattedOrders = orders
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map((o) => ({
                _id: o._id.toString(),
                orderId: o.orderNumber || o._id,
                products: o.order_items.map((item) => ({
                    name: item.product_name || item.productId?.name || "Unknown",
                    image: item.productId?.images?.[0]?.url || "/api/placeholder/50/50",
                })),
                date: o.orderDate || o.createdAt,
                customer: {
                    name: o.userId?.fullname || "Unknown",
                    email: o.userId?.email || "N/A",
                },
                total: (o.total || 0).toFixed(2),
                payment: o.paymentMethod || "N/A",
                status: o.status || "Pending",
            }));

        res.render("ordermanagment", {
            orders: formattedOrders,
            currentPage: Number(page),
            totalPages: Math.ceil(totalOrders / limit),
            totalOrders,
            currentStatus: status || "All",
            searchQuery: search || "",
            sort,
            sortOrder,
            timeRange: timeRange || "all",
            limit: Number(limit),
        });
    } catch (error) {
        console.error("Error in getorderController:", error);
        res.status(500).json({ success: false, message: "Server issue" });
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
        ];
        if (!validStatuses.includes(status)) {
            console.error("updateOrderStatus: Invalid status:", status);
            return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
        }

        let order;
        if (mongoose.Types.ObjectId.isValid(orderId)) {
            order = await Order.findById(orderId);
        } else {
            order = await Order.findOne({ orderNumber: orderId });
        }

        if (!order) {
            console.error("updateOrderStatus: Order not found for ID/orderNumber:", orderId);
            return res.status(404).json({ success: false, message: "Order not found" });
        }

       
        if (order.status === "Cancelled" && status === "Delivered") {
            console.error("updateOrderStatus: Cannot deliver a cancelled order:", orderId);
            return res.status(400).json({ success: false, message: "Cannot deliver a cancelled order" });
        }

        order.status = status;
        await order.save();

       

        res.json({ success: true, message: "Order status updated successfully" });
    } catch (error) {
        console.error("Error in updateOrderStatus:", error.message, error.stack);
        res.status(500).json({ success: false, message: "Server issue: " + error.message });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID" });
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
            return res.status(404).render("page-404", { message: "Order not found" });
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
            formattedDate: new Date(order.orderDate || order.createdAt).toLocaleString("en-IN", {
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

module.exports = {
    getorderController,
    updateOrderStatus,
    getOrderDetails,
};