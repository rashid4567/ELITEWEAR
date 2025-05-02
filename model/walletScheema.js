<<<<<<< Updated upstream
const mongoose = require('mongoose');
const { Schema } = mongoose;

const transactionSchema = new Schema({
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0, 
  },
  date: {
    type: Date,
    default: Date.now,
    index: true,
  },
  transactionRef: {
    type: String,
    required: true,
   
  },
  description: {
    type: String,
    required: true,
    maxlength: 500, 
  },
});

const walletSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      default: 0,
      min: 0, 
    },
    transactions: [transactionSchema],
=======
const mongoose = require("mongoose");

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
          enum: [
            "order_refund",
            "item_refund",
            "cancellation_refund",
            "manual_refund",
            null,
          ],
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
>>>>>>> Stashed changes
  },
  {
    timestamps: true,
  }
);

walletSchema.pre("save", function (next) {
  this.lastUpdated = new Date();
  next();
});

<<<<<<< Updated upstream
walletSchema.pre('save', async function (next) {
  if (this.isModified('userId')) {
    const User = mongoose.model('User');
    const user = await User.findById(this.userId);
    if (!user) {
      return next(new Error('Invalid userId: User does not exist'));
    }
  }
  next();
});

module.exports = mongoose.model('Wallet', walletSchema);
=======
walletSchema.index({ "transactions.date": -1 });
walletSchema.index({ "transactions.refundType": 1 });
walletSchema.index({ "transactions.transactionRef": 1 });

module.exports = mongoose.model("Wallet", walletSchema);
>>>>>>> Stashed changes
