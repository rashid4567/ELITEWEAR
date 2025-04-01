const User = require('../../model/userSChema');
const bcrypt = require("bcrypt");
const env = require("dotenv").config();
const session = require("express-session");
const { sendOtpEmail } = require('../../config/mailer');

function generateOtp() {
    const digit = "1234567890";
    let otp = "";
    for (let i = 0; i < 6; i++) {
        otp += digit[Math.floor(Math.random() * 10)];
    }
    return otp;
}

const forgotPassword = async (req, res) => {
    try {
        res.render("forgotPassword");
    } catch (error) {
        console.log("Unable to get forgotPassword");
        res.redirect("page=404");
    }
};

const forgotemailValidations = async (req, res) => {
    try {
        const { email } = req.body;
        console.log('Received email for validation:', email);
        const findUser = await User.findOne({ email: email });
        if (findUser) {
            console.log('User found:', findUser);
            const otp = generateOtp();
            console.log('Generated OTP:', otp);
            const emailSent = await sendOtpEmail(email, otp);
            if (emailSent.success) {
                req.session.userOtp = otp;
                req.session.email = email;
                res.render("forgotOtp", { email });
                console.log("OTP:", otp);
            } else {
                res.json({ success: false, message: "Failed to send OTP, please try again" });
            }
        } else {
            res.render("forgotPassword", { message: "User not exists" });
        }
    } catch (error) {
        console.log("Error in form validation", error);
        res.redirect("/pageNotfound");
    }
};

const passForgotten = async (req, res) => {
    try {
        const { otp } = req.body;
        if (otp === req.session.userOtp) {
            req.session.userOtp = null; // invalidate the OTP after use
            res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "An error occurred, please try again" });
    }
};

const resetPasswordPage = async (req, res) => {
    try {
        res.render("resetPass");
    } catch (error) {
        res.redirect("/pageNotfound");
    }
};

const resetPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;
        const email = req.session.email;
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        if (email && hashedPassword) {
            await User.updateOne({ email: email }, { password: hashedPassword });
            req.session.email = null; // clear the session email after password reset
            res.json({ success: true, message: "Password reset successfully" });
        } else {
            res.json({ success: false, message: "Failed to reset password, please try again" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "An error occurred, please try again" });
    }
};

module.exports = {
    forgotPassword,
    forgotemailValidations,
    passForgotten,
    resetPasswordPage,
    resetPassword,
};