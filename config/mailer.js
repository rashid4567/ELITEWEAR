const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  secure: true,
  host: "smtp.gmail.com",
  port: 465,
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD,
  },
});

const createMailOptions = (to, otp) => ({
  from: `"Elite Wear" <${process.env.NODEMAILER_EMAIL}>`,
  to,
  subject: "Your OTP Code",
  text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
});

const sendOtpEmail = async (to, otp) => {
  const mailOptions = createMailOptions(to, otp);

  try {
    const info = await transporter.sendMail(mailOptions);

    return { success: true };
  } catch (error) {
    console.error("Error sending OTP email:", error);
    return {
      success: false,
      message: error.message || "Failed to send OTP email",
    };
  }
};

module.exports = { sendOtpEmail };
