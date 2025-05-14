const mongoose = require("mongoose");

const referralHistorySchema = new mongoose.Schema({
  newUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amountToNewUser: {
    type: Number,
    required: true,
  },
  amountToReferrer: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("ReferralHistory", referralHistorySchema);
