const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    orderNumber: {
      type: String,
      unique: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    deliveryDate: {
      type: Date,
    },
    address: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },
    order_items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrderItem",
      },
    ],
    // Original price before discount
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    // Added explicit discount fields
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    // Added delivery charge field
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0
    },
    // Final price after discount and delivery charge
    total: {
      type: Number,
      required: true,
      min: 0
    },
    // Added coupon tracking fields
    couponApplied: {
      type: Boolean,
      default: false
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null
    },
    couponCode: {
      type: String,
      default: ""
    },
    couponDiscountPercent: {
      type: Number,
      default: 0,
      min: 0
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["COD", "Wallet", "Online"]
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Completed", "Failed", "Refunded"],
      default: "Pending",
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
        "Partially Cancelled",
        "Partially Returned",
        "Partially Delivered",
        "Partially Shipped",
      ],
      default: "Processing",
      index: true
    },
    statusHistory: [
      {
        status: {
          type: String,
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
        note: {
          type: String,
          default: "",
        },
      },
    ],
    refunded: {
      type: Boolean,
      default: false,
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    returnRejectionReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model("Order").countDocuments();
    this.orderNumber = `ORD${Date.now().toString().slice(-6)}${(count + 1).toString().padStart(4, "0")}`;
  }
  next();
});

// Add useful indexes
// orderSchema.index({ orderNumber: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ couponApplied: 1 });

module.exports = mongoose.model("Order", orderSchema);