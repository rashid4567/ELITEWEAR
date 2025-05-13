const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: [1, "Quantity must be at least 1"],
          default: 1,
        },
        size: {
          type: String,
          trim: true,
          required: false,
        },
        color: {
          type: String,
          trim: true,
          required: false,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

cartSchema.index({ "items.productId": 1 });

module.exports = mongoose.model("Cart", cartSchema);
