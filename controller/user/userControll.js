const { render } = require("ejs");
const nodemailer = require("nodemailer");
const session = require("express-session");
const bcrypt = require('bcrypt');
require("dotenv").config();
const User = require("../../model/userSChema");
const categories = require("../../model/categoryScheema")
const validator = require('validator');
const crypto = require('crypto');
const Category = require("../../model/categoryScheema");
const Product = require("../../model/productScheema");


const OTP_EXPIRY_MINUTES = 10;
const MAX_EMAIL_RETRIES = 3;
const OTP_LENGTH = 5;
const SALT_ROUNDS = 10;

const debug = process.env.NODE_ENV === 'development' 
    ? (...args) => console.log('[DEBUG]', ...args) 
    : () => {};


const createTransporter = () => {
    const config = {
        service: "gmail",
        auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD
        },
        pool: true,
        maxConnections: 5,
        rateDelta: 2000,
        rateLimit: 5
    };

    const transporter = nodemailer.createTransport(config);

    transporter.verify((error) => {
        if (error) {
            console.error('SMTP Connection Error:', {
                code: error.code,
                command: error.command,
                response: error.response
            });
        } else {
            debug('SMTP Connection Verified');
        }
    });

    return transporter;
};

const transporter = createTransporter();


const generateOtp = () => {
    const otp = crypto.randomInt(
        Math.pow(10, OTP_LENGTH - 1), 
        Math.pow(10, OTP_LENGTH) - 1
    ).toString();
    
    debug(`Generated OTP: ${otp}`);
    return otp;
};


const validateEmail = (email) => {
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
    let attempts = 0;
    
    while (attempts < MAX_EMAIL_RETRIES) {
        attempts++;
        debug(`Email attempt ${attempts} for ${email}`);

        try {
            const mailOptions = {
                from: `"E-Commerce App" <${process.env.NODEMAILER_EMAIL}>`,
                to: email,
                subject: "Verify Your Account",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #4a4a4a;">Email Verification</h2>
                        <p style="font-size: 16px;">Please use the following verification code:</p>
                        <div style="background: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
                            <span style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</span>
                        </div>
                        <p style="font-size: 14px; color: #888;">
                            This code expires in ${OTP_EXPIRY_MINUTES} minutes.
                        </p>
                    </div>
                `,
                headers: {
                    'X-Priority': '1',
                    'Importance': 'high'
                }
            };

            const info = await transporter.sendMail(mailOptions);
            
            debug("Email delivery report:", {
                messageId: info.messageId,
                accepted: info.accepted
            });

            if (info.rejected && info.rejected.length > 0) {
                throw new Error(`Email rejected for: ${info.rejected.join(', ')}`);
            }

            return { success: true, message: "Email sent successfully" };

        } catch (error) {
            console.error(`Email attempt ${attempts} failed:`, {
                errorCode: error.code,
                responseCode: error.responseCode,
                message: error.message
            });

            if (attempts >= MAX_EMAIL_RETRIES) {
                return { 
                    success: false, 
                    message: "Failed to send email after multiple attempts",
                    error: error.message 
                };
            }

            const delay = Math.pow(2, attempts) * 1000;
            debug(`Waiting ${delay}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
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
        
        
        const categories = await Category.find({ isListed: true });
        console.log(`Found ${categories.length} listed categories`);
        
        if (categories.length === 0) {
            console.log("No listed categories found");
            return res.render("home", {
                user: userId ? await User.findById(userId) : null,
                data: [],
                cat: [],
                error: "No product categories are currently available"
            });
        }
        

        const categoryIds = categories.map(category => category._id);
        
        
        const productData = await Product.find({
            isActive: true,
            categoryId: { $in: categoryIds }
        }).populate("categoryId").exec();
        
        console.log(`Found ${productData.length} products`);
        
      
        if (productData.length === 0) {
           
            const allActiveProducts = await Product.find({ isActive: true });
            console.log(`Found ${allActiveProducts.length} active products total`);
            
  
            const allProducts = await Product.find({});
            console.log(`Found ${allProducts.length} total products in database`);
            
            
            if (allActiveProducts.length > 0) {
                const matchingProducts = allActiveProducts.filter(p => 
                    categoryIds.some(cid => cid.equals(p.categoryId))
                );
                console.log(`${matchingProducts.length} active products match our listed categories`);
            }
        }
        
  
        const formattedProductData = productData.map(product => {
            const firstVariant = product.variants?.[0] || {};
            return {
                _id: product._id,
                name: product.name,
                images: product.images || [],
                salePrice: firstVariant.salePrice || 0,
                variants: product.variants || [],
                ratings: product.ratings || { average: 0, count: 0 }
            };
        });
        
        const userData = userId ? await User.findById(userId) : null;
        res.render("home", {
            user: userData,
            data: formattedProductData,
            cat: categories,
            error: formattedProductData.length === 0 ? "No products available" : null
        });
    } catch (error) {
        console.error("Error loading home page:", error);
        console.error(error.stack);
        res.render("home", {
            user: null,
            data: [],
            cat: [],
            error: "Server error occurred while loading the page"
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

const userSignup = async (req, res) => {
    try {
        const { fullname, email, mobile, password, cpassword } = req.body;

        if (password !== cpassword) {
            return res.render("signup", { 
                message: "Passwords do not match", 
                user: null,
                formData: { fullname, email, mobile }
            });
        }

        validateEmail(email);

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render("signup", { 
                message: "User with this email already exists", 
                user: null,
                formData: { fullname, email, mobile }
            });
        }

        const otp = generateOtp();
        debug(`OTP for ${email}: ${otp}`);

        const emailResult = await sendVerificationEmail(email, otp);
        if (!emailResult.success) {
            return res.render("signup", { 
                message: "Failed to send verification. Please try again later.", 
                user: null,
                formData: { fullname, email, mobile }
            });
        }

        req.session.registration = {
            otp,
            userData: { fullname, email, mobile, password },
            otpExpires: Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000)
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

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const { registration } = req.session;

        if (!registration) {
            return res.status(400).json({ 
                success: false, 
                message: "Session expired. Please register again." 
            });
        }

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

        const hashedPassword = await securePassword(registration.userData.password);
        const newUser = new User({
            ...registration.userData,
            password: hashedPassword,
            isVerified: true
        });

        await newUser.save();
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
        
        if (!registration?.userData?.email) {
            return res.status(400).json({
                success: false, 
                message: "Session expired. Please register again."
            });
        }

        const newOtp = generateOtp();
        debug(`Resent OTP for ${registration.userData.email}: ${newOtp}`);

        const emailResult = await sendVerificationEmail(registration.userData.email, newOtp);
        if (!emailResult.success) {
            return res.status(500).json({
                success: false, 
                message: "Failed to resend OTP. Please try again."
            });
        }

        req.session.registration.otp = newOtp;
        req.session.registration.otpExpires = Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000);

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
        if (!req.session.user) {
            return res.render("login", { user: null });
        }
        res.redirect('/');
    } catch (error) {
        console.error("Login page error:", error);
        res.status(500).send("Server issue");
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

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
                console.error("Session destruction error:", err);
                return res.redirect('/page-not-found');
            }
            res.locals.user = null;
            res.redirect('/login');
        });
    } catch (error) {
        console.error("Logout error:", error);
        res.redirect('/page-not-found');
    }
};
const allproduct = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
 
        const categories = await Category.find({ isListed: true }); // Fetching multiple categories
        const categoryIds = categories.map(category => category._id.toString());
 
        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;
 
        const products = await Product.find({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gte: 0 }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
 
        const totalProduct = await Product.countDocuments({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gte: 0 }
        });
 
        const totalPages = Math.ceil(totalProduct / limit);
 
        res.render("allproduct", {
            user: userData,
            products: products,
            categories: categories, 
            totalProduct: totalProduct,
            currentPage: page,
            totalPages: totalPages
        });
 
    } catch (error) {
        console.error("Error loading allproduct shop page:", error);
        return res.redirect('/page-not-found');
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
    allproduct,
};