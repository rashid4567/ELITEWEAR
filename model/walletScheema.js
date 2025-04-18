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
  },
  {
    timestamps: true,
  }
);


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