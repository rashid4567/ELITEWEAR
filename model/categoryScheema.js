const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  offer: {
    type: Number,
    default: 0 
  },
  sales: {
    type: Number,
    default: 0 
  },
  stock: {
    type: Number,
    required: true 
  },
  addedDate: {
    type: Date,
    default: Date.now 
  },
  isListed: {
    type: Boolean,
    default: true 
  }
});
const Category = mongoose.model("Category", categorySchema);

module.exports = Category
