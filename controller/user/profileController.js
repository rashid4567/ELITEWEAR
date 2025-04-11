const { sendOtpEmail } = require("../../config/mailer");
const bcrypt = require("bcrypt");
const User = require("../../model/userSChema");
const crypto = require("crypto");
const validator = require("validator");

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 5;
const SALT_ROUNDS = 10;

const debug =
  process.env.NODE_ENV === "development"
    ? (...args) => console.log("[DEBUG]", ...args)
    : () => {};

const generateOtp = () => {
  const otp = crypto
    .randomInt(Math.pow(10, OTP_LENGTH - 1), Math.pow(10, OTP_LENGTH) - 1)
    .toString();
  debug(`Generated OTP: ${otp}`);
  return otp;
};

const validateEmail = (email) => {
  if (!validator.isEmail(email)) {
    throw new Error("Invalid email format");
  }
  return true;
};

const securePassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

const sendVerificationEmail = async (email, otp) => {
  const result = await sendOtpEmail(email, otp);
  if (result.success) {
    debug(`OTP for ${email}: ${otp}`);
  }
  return result;
};

const forgotPassword = async (req, res) => {
  try {
    res.render("forgotPassword");
  } catch (error) {
    console.error("Unable to get forgotPassword page:", error);
    res.redirect("/page-not-found");
  }
};

const forgotemailValidations = async (req, res) => {
  try {
    const { email } = req.body;
    validateEmail(email);

    const findUser = await User.findOne({ email: email });
    if (findUser) {
      const otp = generateOtp();
      const emailSent = await sendOtpEmail(email, otp);
      if (emailSent.success) {
        req.session.userOtp = otp;
        req.session.email = email;
        req.session.otpExpires = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

        return res.json({
          success: true,
          message: "OTP sent successfully",
          redirectUrl: "/forgot-otp",
        });
      } else {
        return res.json({
          success: false,
          message: "Failed to send OTP, please try again",
        });
      }
    } else {
      return res.json({ success: false, message: "User does not exist" });
    }
  } catch (error) {
    console.error("Error in email validation:", error);
    res.status(500).json({ success: false, message: "An error occurred, please try again" });
  }
};

const passForgotten = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.userOtp) {
      return res.json({
        success: false,
        message: "Session expired or no OTP found. Please try again.",
      });
    }

    if (Date.now() > req.session.otpExpires) {
      req.session.userOtp = null;
      req.session.email = null;
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    const storedOtp = String(req.session.userOtp);
    const enteredOtp = String(otp);

    if (storedOtp === enteredOtp) {
      req.session.userOtp = null;
      req.session.otpVerified = true;
      return res.json({ success: true, redirectUrl: "/reset-password" });
    } else {
      return res.json({ success: false, message: "OTP does not match" });
    }
  } catch (error) {
    console.error("[passForgotten] Error in OTP validation:", error);
    res.status(500).json({ success: false, message: "An error occurred, please try again" });
  }
};

const resetPasswordPage = async (req, res) => {
  try {
    if (req.session.otpVerified) {
      res.render("resetPass");
    } else {
      res.redirect("/forgot-password");
    }
  } catch (error) {
    console.error("Error rendering reset password page:", error);
    res.redirect("/page-not-found");
  }
};

const resetPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const email = req.session.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Session expired or invalid. Please try again.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const hashedPassword = await securePassword(newPassword);
    const findUser = await User.findOne({ email: email });
    if (!findUser) {
      return res.status(400).json({ success: false, message: "User not found. Please try again." });
    }

    const updateResult = await User.updateOne(
      { email: email },
      { password: hashedPassword }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Password update failed. Please try again.",
      });
    }

    req.session.email = null;
    req.session.otpVerified = false;
    return res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ success: false, message: "An error occurred, please try again" });
  }
};

const resendForgotOtp = async (req, res) => {
  try {
    const email = req.session.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "No valid session. Please try again.",
      });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

    const emailSent = await sendOtpEmail(email, otp);
    if (emailSent.success) {
      return res.status(200).json({ success: true, message: "OTP resent successfully" });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to resend OTP, please try again",
      });
    }
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({
      success: false,
      message: "Internal server issue, please try again",
    });
  }
};

const loadProfile = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect("/login");
    }
    const { fullname, email, mobile } = req.session.user;
    if (!fullname) {
      return res.redirect("/login");
    }
    return res.render("profile", { fullname, email, mobile });
  } catch (error) {
    console.error("Error in loadProfile function:", error);
    return res.redirect("/page-404/");
  }
};

const loadProfileEdit = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect("/login");
    }

    const { fullname, email, mobile } = req.session.user;

    if (!fullname || !email) {
      return res.redirect("/login");
    }

    return res.render("profileEdittor", {
      fullname: fullname || "Unknown user",
      email: email || "",
      mobile: mobile || "",
    });
  } catch (error) {
    console.error("Error in loadProfileEdit function:", error);
    return res.redirect("/page-404/");
  }
};

const sendemilUpdateOtp = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const currentEmail = req.session.user.email;

    if (!newEmail) {
      return res.status(400).json({ success: false, message: "New email is required" });
    }

    if (newEmail === currentEmail) {
      return res.status(400).json({ success: false, message: "New email must be different from the current email" });
    }

    validateEmail(newEmail);

    // Check if the new email is already in use by another user
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser && existingUser.email !== currentEmail) {
      return res.status(400).json({ success: false, message: "This email is already in use by another user" });
    }

    const otp = generateOtp();
    req.session.emailUpdateOtp = otp;
    req.session.newEmail = newEmail;
    req.session.otpExpires = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

    const emailSent = await sendOtpEmail(newEmail, otp);
    if (emailSent.success) {
      return res.status(200).json({ success: true, message: "OTP sent to new email" });
    }
    return res.status(500).json({ success: false, message: "Failed to send OTP" });
  } catch (error) {
    console.error("Unable to send email for update:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const verifyUpdateOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.emailUpdateOtp) {
      return res.status(400).json({ success: false, message: "No OTP session found" });
    }

    if (Date.now() > req.session.otpExpires) {
      req.session.emailUpdateOtp = null;
      req.session.newEmail = null;
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    if (String(req.session.emailUpdateOtp) === String(otp)) {
      const newEmail = req.session.newEmail;
      const updateResult = await User.updateOne(
        { email: req.session.user.email },
        { email: newEmail }
      );

      if (updateResult.modifiedCount > 0) {
        req.session.user.email = newEmail;
        req.session.emailUpdateOtp = null;
        req.session.newEmail = null;
        return res.json({ success: true, message: "Email updated successfully" });
      }
      return res.status(400).json({ success: false, message: "Email update failed" });
    }
    return res.status(400).json({ success: false, message: "Invalid OTP" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { fullname, mobile } = req.body;
    const currentEmail = req.session.user.email;

    const updateFields = { fullname, mobile };

    const updatedUser = await User.updateOne(
      { email: currentEmail },
      updateFields
    );

    if (updatedUser.modifiedCount > 0) {
      req.session.user.fullname = fullname;
      req.session.user.mobile = mobile;
      return res.json({ success: true, message: "Profile updated successfully" });
    }
    return res.status(400).json({ success: false, message: "Update failed" });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  forgotPassword,
  forgotemailValidations,
  passForgotten,
  resetPasswordPage,
  resetPassword,
  resendForgotOtp,
  loadProfile,
  loadProfileEdit,
  sendemilUpdateOtp,
  verifyUpdateOtp,
  updateProfile,
};