const { render } = require("ejs");
const nodemailer = require("nodemailer");
const session = require("express-session");
const bcrypt = require('bcrypt');
require("dotenv").config();
const User = require("../../model/userSChema");
const validator = require('validator');

// Improved OTP generation with crypto module
const crypto = require('crypto');
const generateOtp = () => {
    return crypto.randomInt(10000, 99999).toString(); // 6-digit OTP
};

// Enhanced email transporter with connection pooling
const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false // For development only
    },
    pool: true, // Use connection pooling
    maxConnections: 5,
    maxMessages: 100
});

// Verify transporter connection on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP Connection Error:', error);
    } else {
        console.log('SMTP Server is ready to take our messages');
    }
});

// Enhanced email sending with retries
const sendVerificationEmail = async (email, otp) => {
    const maxRetries = 3;
    let attempts = 0;
    
    while (attempts < maxRetries) {
        try {
            const mailOptions = {
                from: `"Your App Name" <${process.env.NODEMAILER_EMAIL}>`,
                to: email,
                subject: "Verify Your Account",
                text: `Your verification code is: ${otp}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #4a4a4a;">Email Verification</h2>
                        <p style="font-size: 16px;">Please use the following verification code to complete your registration:</p>
                        <div style="background: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
                            <span style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</span>
                        </div>
                        <p style="font-size: 14px; color: #888;">
                            This code will expire in 10 minutes. If you didn't request this, please ignore this email.
                        </p>
                    </div>
                `
            };

            const info = await transporter.sendMail(mailOptions);
            console.log("Email sent:", info.messageId);
            console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
            return true;
            
        } catch (error) {
            attempts++;
            console.error(`Email send attempt ${attempts} failed:`, error);
            
            if (attempts >= maxRetries) {
                console.error("Max retries reached for email sending");
                return false;
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
        }
    }
};

// Middleware to validate email format
const validateEmail = (email) => {
    if (!validator.isEmail(email)) {
        throw new Error('Invalid email format');
    }
    return true;
};

const pageNotfound = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = userId ? await User.findById(userId) : null;
        return res.render("page-404", { user: userData });
    } catch (error) {
        console.error("Error rendering 404 page:", error);
        res.status(500).send("Error loading error page");
    }
};

const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = userId ? await User.findById(userId) : null;
        res.render("home", { user: userData });
    } catch (error) {
        console.error("Error loading home page:", error);
        res.status(500).send("Server error");
    }
};

const userSignup = async (req, res) => {
    try {
        const { fullname, email, mobile, password, cpassword } = req.body;

        // Input validation
        if (password !== cpassword) {
            return res.render("signup", { 
                message: "Passwords do not match", 
                user: null,
                formData: { fullname, email, mobile }
            });
        }

        validateEmail(email); // Validate email format

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render("signup", { 
                message: "User with this email already exists", 
                user: null,
                formData: { fullname, email, mobile }
            });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        
        if (!emailSent) {
            return res.render("signup", { 
                message: "Failed to send verification email. Please try again.", 
                user: null,
                formData: { fullname, email, mobile }
            });
        }

        // Store data in session
        req.session.registration = {
            otp,
            userData: { fullname, email, mobile, password },
            otpExpires: Date.now() + 600000 // 10 minutes expiration
        };

        return res.redirect("/verify-otp");
        
    } catch (error) {
        console.error("Signup error:", error);
        return res.render("signup", { 
            message: error.message || "Registration failed", 
            user: null,
            formData: req.body
        });
    }
};

const loadUserSignup = async (req, res) => {
    try {
        res.render("signup", { user: null, message: null, formData: null });
    } catch (error) {
        console.error("Signup page error:", error);
        res.status(500).send("Server issue");
    }
};

const securePassword = async (password) => {
    return await bcrypt.hash(password, 12); // Increased salt rounds
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const { registration } = req.session;

        if (!registration || !registration.otp) {
            return res.status(400).json({ 
                success: false, 
                message: "Session expired. Please register again." 
            });
        }

        // Check OTP expiration
        if (Date.now() > registration.otpExpires) {
            delete req.session.registration;
            return res.status(400).json({ 
                success: false, 
                message: "OTP expired. Please request a new one." 
            });
        }

        if (otp !== registration.otp) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid OTP. Please try again." 
            });
        }

        // OTP verified - create user
        const { userData } = registration;
        const passwordHash = await securePassword(userData.password);

        const newUser = new User({
            fullname: userData.fullname,
            email: userData.email,
            mobile: userData.mobile,
            password: passwordHash,
            isVerified: true
        });

        await newUser.save();

        // Clean up session
        req.session.user = newUser._id;
        delete req.session.registration;

        return res.json({ 
            success: true, 
            redirectUrl: "/" 
        });

    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "An error occurred during verification" 
        });
    }
};

const resendOtp = async (req, res) => {
    try {
        const { registration } = req.session;
        
        if (!registration || !registration.userData) {
            return res.status(400).json({
                success: false, 
                message: "Session expired. Please register again."
            });
        }

        const { email } = registration.userData;
        const otp = generateOtp();
        
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.status(500).json({
                success: false, 
                message: "Failed to resend OTP. Please try again."
            });
        }

        // Update session with new OTP
        req.session.registration.otp = otp;
        req.session.registration.otpExpires = Date.now() + 600000; // 10 minutes

        return res.json({
            success: true, 
            message: "New OTP sent successfully"
        });

    } catch (error) {
        console.error("Resend OTP error:", error);
        return res.status(500).json({
            success: false, 
            message: "Internal server error"
        });
    }
};

const userLogin = async (req, res) => {
    try {
        if(!req.session.user){
            return res.render("login", { user: null });
        }else{
            res.redirect('/')
        }
    } catch (error) {
        console.log(" User login page is not found");
        res.status(500).send("Server issue");
    }
};
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("Login attempt with email:", email);


        if (!email || !password) {
            return res.render("login", { message: "Email and password are required", user: null });
        }

   
        const findUser = await User.findOne({ isAdmin: 0, email: email });

        if (!findUser) {
            return res.render("login", { message: "User not found", user: null });
        }

        
        if (findUser.isBlocked) {
            return res.render("login", { message: "User blocked by the admin", user: null });
        }


        if (!findUser.password) {
            console.log("Error: No password found for user:", findUser);
            return res.render("login", { message: "Login failed, please contact support", user: null });
        }

  
        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            return res.render("login", { message: "Incorrect password", user: null });
        }

       
        req.session.user = findUser._id;
        return res.redirect('/');

    } catch (error) {
        console.error("Login error:", error);
        return res.render("login", { message: 'Login failed, please try again later', user: null });
    }
};


const logout = async (req, res) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.log("Error in session destroy:", err.message);
          return res.redirect('/page-not-found');
        }
        res.locals.user = null;
        res.redirect('/login');
      });
    } catch (error) {
      console.log("Logout error:", error);
      res.redirect('/page-not-found');
    }
};
  
module.exports = {
    loadHomepage,
    pageNotfound,
    userSignup,
    userLogin,
    loadUserSignup,
    verifyOtp,
    resendOtp,
    login,
    logout,
    sendVerificationEmail
};