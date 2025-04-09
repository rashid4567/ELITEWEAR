const { sendOtpEmail } = require("../../config/mailer");
const bcrypt = require("bcrypt");
const User = require("../../model/userSChema");
const crypto = require("crypto");
const validator = require("validator");

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 5;
const SALT_ROUNDS = 10;

const debug = process.env.NODE_ENV === 'development'
    ? (...args) => console.log('[DEBUG]', ...args)
    : () => { };

const generateOtp = () => {
    console.log('Generating OTP...');
    const otp = crypto.randomInt(
        Math.pow(10, OTP_LENGTH - 1),
        Math.pow(10, OTP_LENGTH) - 1
    ).toString();
    console.log(`Generated OTP: ${otp}`);
    debug(`Generated OTP: ${otp}`);
    return otp;
};

const validateEmail = (email) => {
    console.log(`Validating email: ${email}`);
    if (!validator.isEmail(email)) {
        throw new Error('Invalid email format');
    }
    if (!validator.isEmail(email, { domain_specific_validation: true })) {
        throw new Error('Suspicious email domain');
    }
    return true;
};

const securePassword = async (password) => {
    return await bcrypt.hash(password, SALT_ROUNDS);
};

const sendVerificationEmail = async (email, otp) => {
    console.log(`Sending OTP ${otp} to ${email}`);
    const result = await sendOtpEmail(email, otp);
    console.log(`Email send result for ${email}:`, result);
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
                req.session.otpExpires = Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000);
                console.log('OTP saved in session:', req.session.userOtp);
                return res.json({ success: true, message: "OTP sent successfully", redirectUrl: "/forgot-otp" });
            } else {
                return res.json({ success: false, message: "Failed to send OTP, please try again" });
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
        console.log(`[passForgotten] Received OTP for validation: ${otp}`);
        console.log(`[passForgotten] Stored OTP in session: ${req.session.userOtp}`);
        console.log(`[passForgotten] Session data:`, req.session);

        if (!req.session.userOtp) {
            console.log('[passForgotten] No OTP found in session');
            return res.json({ success: false, message: "Session expired or no OTP found. Please try again." });
        }

        if (Date.now() > req.session.otpExpires) {
            console.log('OTP expired');
            req.session.userOtp = null;
            req.session.email = null;
            return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
        }


        const storedOtp = String(req.session.userOtp);
        const enteredOtp = String(otp);

        console.log(`[passForgotten] Comparing stored OTP: '${storedOtp}' with entered OTP: '${enteredOtp}'`);
        if (storedOtp === enteredOtp) {
            console.log('[passForgotten] OTP matched successfully');
            req.session.userOtp = null;
            req.session.otpVerified = true;
            return res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            console.log('[passForgotten] OTP does not match');
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

        console.log("Resetting password for email:", email);
        console.log("New password:", newPassword);

        if (!email) {
            return res.status(400).json({ success: false, message: "Session expired or invalid. Please try again." });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match" });
        }

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, message: "Password must be at least 8 characters long" });
        }

        const hashedPassword = await securePassword(newPassword);
        console.log("Hashed password:", hashedPassword);


        const findUser = await User.findOne({ email: email });
        if (!findUser) {
            console.log("User not found for email:", email);
            return res.status(400).json({ success: false, message: "User not found. Please try again." });
        }

        const updateResult = await User.updateOne({ email: email }, { password: hashedPassword });
        console.log("Password update result:", updateResult);
        if (updateResult.nModified === 0) {
            return res.status(400).json({ success: false, message: "Password update failed. Please try again." });
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
            console.log("No valid session for resend");
            return res.status(400).json({ success: false, message: 'No valid session. Please try again.' });
        }

        const otp = generateOtp();
        req.session.userOtp = otp;
        req.session.otpExpires = Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000);
        console.log("Resending OTP to email:", email);
        const emailSent = await sendOtpEmail(email, otp);
        if (emailSent.success) {
            console.log('OTP saved in session:', req.session.userOtp);
            return res.status(200).json({ success: true, message: 'OTP resent successfully' });
        } else {
            return res.status(500).json({ success: false, message: 'Failed to resend OTP, please try again' });
        }
    } catch (error) {
        console.error("Error resending OTP:", error);
        res.status(500).json({ success: false, message: 'Internal server issue, please try again' });
    }
};
const loadProfile = async (req, res) => {
    try {
        console.log("session data : ",req.session)
        if(!req.session.user || !req.session.user.fullname){
            console.log("No user or fullname in the session")
            return res.redirect("/login")
        }
        const fullname = req.session.user.fullname;
        console.log("Rendering the user name of the User",fullname)
        return res.render("profile", {
            fullname:fullname
        });
    } catch (error) {
        console.error("Error in loading profile:", error);
        res.redirect('/page-404/');
    }
}
module.exports = {
    forgotPassword,
    forgotemailValidations,
    passForgotten,
    resetPasswordPage,
    resetPassword,
    resendForgotOtp,
    loadProfile,
};