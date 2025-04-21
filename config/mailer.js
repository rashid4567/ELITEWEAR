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
  subject: "Your Elite Wear Verification Code",
  html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Elite Wear Verification</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333333;
          margin: 0;
          padding: 0;
        }
        .email-container {
          max-width: 600px;
          margin: 0 auto;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }
        .email-header {
          background-color: #000000;
          padding: 24px;
          text-align: center;
        }
        .email-header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
          letter-spacing: 1px;
        }
        .email-body {
          padding: 32px 24px;
          background-color: #ffffff;
        }
        .email-body p {
          margin: 0 0 16px;
          font-size: 16px;
        }
        .otp-container {
          margin: 32px 0;
          text-align: center;
        }
        .otp-code {
          font-size: 36px;
          font-weight: bold;
          letter-spacing: 5px;
          color: #000000;
          padding: 16px 24px;
          background-color: #f7f7f7;
          border-radius: 6px;
          display: inline-block;
        }
        .email-footer {
          padding: 16px 24px;
          background-color: #f7f7f7;
          text-align: center;
          font-size: 14px;
          color: #777777;
        }
        .email-footer p {
          margin: 8px 0;
        }
        .note {
          font-size: 14px;
          color: #888888;
        }
        .button {
          background-color: #000000;
          color: #ffffff;
          text-decoration: none;
          display: inline-block;
          padding: 12px 24px;
          border-radius: 4px;
          font-weight: bold;
          margin-top: 16px;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h1>ELITE WEAR</h1>
        </div>
        <div class="email-body">
          <p>Hello,</p>
          <p>Thank you for choosing Elite Wear. Please use the verification code below to complete your request:</p>
          
          <div class="otp-container">
            <div class="otp-code">${otp}</div>
          </div>
          
          <p>This verification code will expire in <strong>10 minutes</strong>.</p>
          <p>If you did not request this code, please ignore this email or contact our support team if you have concerns.</p>
          
          <p class="note">For security reasons, please do not share this code with anyone.</p>
        </div>
        <div class="email-footer">
          <p>&copy; ${new Date().getFullYear()} Elite Wear. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,
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