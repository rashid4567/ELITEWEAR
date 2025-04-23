const mongoose = require('mongoose');
const { Schema } = mongoose;

const referralHistorySchema = new Schema({
  newUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  referrerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amountToNewUser: {
    type: Number,
    required: true,
    min: 0,
  },
  amountToReferrer: {
    type: Number,
    required: true,
    min: 0,
  },
  date: {
    type: Date,
    default: Date.now,
    index: true,
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ReferralHistory', referralHistorySchema);