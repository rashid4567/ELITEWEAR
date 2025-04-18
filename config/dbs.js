const mongoose = require("mongoose");

const connectDB = async () => {
  try {

    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in .env file!");
    }


    await mongoose.connect(process.env.MONGODB_URI);

    console.log(" MongoDB connected successfully!");
  } catch (error) {
    console.error(" Database connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
