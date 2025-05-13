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

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    discountPerUnit: {
      type: Number,
      default: 0,
      min: 0
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },

    finalPrice: {
      type: Number,
      min: 0,
      default: function() {
        return this.price - (this.discountPerUnit || 0);
      }
    },
   
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


orderItemSchema.pre('validate', function(next) {
  if (this.finalPrice < 0) {
    this.finalPrice = 0;
  }
  next();
});


orderItemSchema.index({ refundDate: -1 });
orderItemSchema.index({ returnRequestedDate: -1 });
orderItemSchema.index({ returnCompletedDate: -1 });
orderItemSchema.index({ couponApplied: 1 });


module.exports = mongoose.models.OrderItem || mongoose.model("OrderItem", orderItemSchema);
