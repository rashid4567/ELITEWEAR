const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ["COD", "Online", "Wallet"],
        required: true,
    },
    orderDate: {
        type: Date,
        default: Date.now,
    },
    deliveryDate: {
        type: Date, 
    },
    status: {
        type: String,
        enum: [
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
        ],
        default: "Pending",
    },
    address: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Address",
        required: true,
    },
    transactionId: {
        type: String,
    },
    couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
    },
    total: {
        type: Number,
        required: true,
        min: 0,
    },
    order_items: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrderItem",
        },
    ],
    orderNumber: {
        type: String,
        required: true,
        unique: true,
    },
    refunded: {
        type: Boolean,
        default: false, 
    },
    cancelReason: {
        type: String,
        maxlength: 500, 
    },
    returnReason: {
        type: String,
        maxlength: 500, 
    },
    returnRejectionReason: {
        type: String,
        maxlength: 500, 
    },
    returnRequestedDate: {
        type: Date,
    },
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);