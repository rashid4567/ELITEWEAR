  const mongoose = require("mongoose")

  const walletSchema = new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      transactions: [
        {
          type: {
            type: String,
            enum: ["credit", "debit"],
            required: true,
          },
          amount: {
            type: Number,
            required: true,
            min: 0,
          },
          transactionRef: {
            type: String,
            required: true,
            // index: true,
          },
          description: {
            type: String,
            required: true,
          },
          date: {
            type: Date,
            default: Date.now,
            index: true,
          },
          orderReference: {
            type: String,
            index: true,
          },
          orderItemReference: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrderItem",
          },
          productReference: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
          },
          refundType: {
            type: String,
            enum: ["order_refund", "item_refund", "cancellation_refund", "manual_refund", null],
          },
          status: {
            type: String,
            enum: ["completed", "pending", "failed"],
            default: "completed",
          },
          metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
          },
        },
      ],
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    {
      timestamps: true,
    },
  )


  walletSchema.pre("save", function (next) {
    this.lastUpdated = new Date()
    next()
  })

  walletSchema.index({ "transactions.date": -1 })
  walletSchema.index({ "transactions.refundType": 1 })
  walletSchema.index({ "transactions.transactionRef": 1 })

  module.exports = mongoose.model("Wallet", walletSchema)
