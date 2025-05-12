const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    product_name: {
      type: String,
      required: true,
    },
    size: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    // Original price per unit
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    // Discount per unit
    discountPerUnit: {
      type: Number,
      default: 0,
      min: 0
    },
    // Total discount for this item (quantity * discountPerUnit)
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    // Final price per unit after discount
    finalPrice: {
      type: Number,
      min: 0,
      default: function() {
        return this.price - (this.discountPerUnit || 0);
      }
    },
    // Total amount for this item (quantity * finalPrice)
    total_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    itemImage: {
      type: String,
      default: null,
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
      default: "Processing",
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        date: { type: Date, default: Date.now },
        note: { type: String, default: "" },
      },
    ],
    refunded: {
      type: Boolean,
      default: false,
      index: true,
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    refundDate: {
      type: Date,
    },
    refundTransactionRef: {
      type: String,
    },
    refundReason: {
      type: String,
      default: "",
    },
    refundProcessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    refundNotes: {
      type: String,
      default: "",
    },
    partialRefund: {
      type: Boolean,
      default: false,
    },
    cancelReason: {
      type: String,
      default: "",
    },
    cancelledAt: {
      type: Date,
    },
    returnReason: {
      type: String,
      default: "",
    },
    returnRequestedDate: {
      type: Date,
    },
    returnApprovedDate: {
      type: Date,
    },
    returnCompletedDate: {
      type: Date,
    },
    rejectReason: {
      type: String,
      default: "",
    },
    // Coupon tracking fields
    couponApplied: {
      type: Boolean,
      default: false,
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    couponCode: {
      type: String,
      default: "",
    },
    couponDiscountPercent: {
      type: Number,
      default: 0,
      min: 0
    },
  },
  {
    timestamps: true,
  }
);

// Add validation to ensure finalPrice is not negative
orderItemSchema.pre('validate', function(next) {
  if (this.finalPrice < 0) {
    this.finalPrice = 0;
  }
  next();
});

// Add useful indexes
orderItemSchema.index({ refundDate: -1 });
orderItemSchema.index({ returnRequestedDate: -1 });
orderItemSchema.index({ returnCompletedDate: -1 });
orderItemSchema.index({ couponApplied: 1 });


module.exports = mongoose.models.OrderItem || mongoose.model("OrderItem", orderItemSchema);
