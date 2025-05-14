const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  image: {
    type: String,
    required: true,
  },
  startingDate: {
    type: Date,
    required: true,
  },
  endingDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
  },
  link: {
    type: String,
    default: "#",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

bannerSchema.pre("save", function (next) {
  const today = new Date();
  if (today < this.startingDate) {
    this.status = "Upcoming";
  } else if (today >= this.startingDate && today <= this.endingDate) {
    const diffDays = Math.ceil(
      (this.endingDate - today) / (1000 * 60 * 60 * 24)
    );
    this.status = `${diffDays} days left`;
  } else {
    this.status = "Expired";
  }
  next();
});

module.exports = mongoose.model("Banner", bannerSchema);
