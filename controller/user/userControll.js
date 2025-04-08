const { render } = require("ejs");
const session = require("express-session");
const bcrypt = require('bcrypt');
require("dotenv").config();
const User = require("../../model/userSChema");
const validator = require('validator');
const crypto = require('crypto');
const Category = require("../../model/categoryScheema");
const Product = require("../../model/productScheema");
const Banner = require("../../model/BannerScheema");
const { sendOtpEmail } = require("../../config/mailer");

const OTP_EXPIRY_MINUTES = 15;
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
        const today = new Date().toISOString();
        const findBanner = await Banner.find({
            startingDate: { $lt: new Date(today) },
            endingDate: { $gt: new Date(today) }
        });
        const categories = await Category.find({ isListed: true });
        const categoryIds = categories.map(category => category._id);
        const productData = await Product.find({
            isActive: true,
            categoryId: { $in: categoryIds }
        }).sort({createdAt: -1}).populate("categoryId").exec();

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

        res.render("home", {
            user: userData,
            data: formattedProductData,
            cat: categories,
            Banner: findBanner || [],
            error: formattedProductData.length === 0 ? "No products available" : null
        });
    } catch (error) {
        console.error("Error loading home page:", error);
        res.render("home", { user: null, data: [], cat: [], Banner: [], error: "Server error" });
    }
};

const loadUserSignup = async (req, res) => {
    try {
        console.log('Loading signup page');
        console.log('All flash messages:', req.flash());
        const errorMessage = req.flash('error').length > 0 ? req.flash('error')[0] : null;
        console.log('Retrieved flash error:', errorMessage);
        res.render("signup", { 
            user: null, 
            message: errorMessage || null, 
            formData: null 
        });
    } catch (error) {
        console.error("Signup page error:", error);
        res.status(500).send("Server issue");
    }
};
const userSignup = async (req, res) => {
    try {
        console.log('Signup request received:', req.body);
        const { fullname, email, mobile, password, cpassword } = req.body;

       
        if (password !== cpassword) {
            console.log('Passwords do not match');
            return res.render("signup", {
                message: "Passwords do not match",
                user: null,
                formData: { fullname, email, mobile }
            });
        }

      
        validateEmail(email);

      
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('User already exists:', email);
            return res.render("signup", {
                message: "User with this email already exists",
                user: null,
                formData: { fullname, email, mobile }
            });
        }

    
        const otp = generateOtp();
        console.log(`Signup OTP for ${email}: ${otp}`);

      
        const emailResult = await sendVerificationEmail(email, otp);
        console.log('Email send result:', emailResult);

        if (!emailResult.success) {
            console.log('Email sending failed');
            return res.render("signup", {
                message: "Failed to send verification email",
                user: null,
                formData: { fullname, email, mobile }
            });
        }

        console.log('Step 6: Set Session');
        req.session.registration = {
            otp,
            userData: { fullname, email, mobile, password },
            otpExpires: Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000)
        };
        console.log('Session set:', req.session.registration);

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
        console.log('Verify OTP request received:', req.body);
        const { otp } = req.body;
        const { registration } = req.session;

        if (!registration) {
            console.log('No registration session found');
            return res.status(400).json({
                success: false,
                message: "Session expired. Please register again."
            });
        }

        if (Date.now() > registration.otpExpires) {
            console.log('OTP expired');
            delete req.session.registration;
            return res.status(400).json({
                success: false,
                message: "OTP expired. Please request a new one."
            });
        }

        console.log(`Comparing OTP: received=${otp}, stored=${registration.otp}`);
        if (otp !== registration.otp) {
            console.log('Invalid OTP');
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
        console.log('User verified, session updated:', req.session);

        return res.json({
            success: true,
            redirectUrl: "/"
        });
    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({
            success: false,
            message: "Verification error"
        });
    }
};

const resendOtp = async (req, res) => {
    try {
        console.log('Resend OTP request received');
        const { registration } = req.session;

        if (!registration?.userData?.email) {
            console.log('No valid session for resend');
            return res.status(400).json({
                success: false,
                message: "Session expired. Please register again."
            });
        }

        const newOtp = generateOtp();
        console.log(`New OTP for ${registration.userData.email}: ${newOtp}`);

        const emailResult = await sendVerificationEmail(registration.userData.email, newOtp);
        console.log('Resend email result:', emailResult);

        if (!emailResult.success) {
            console.log('Resend email failed');
            return res.status(500).json({
                success: false,
                message: "Failed to resend OTP"
            });
        }

        req.session.registration.otp = newOtp;
        req.session.registration.otpExpires = Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000);
        console.log('Session updated with new OTP:', req.session.registration);

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
            return res.render("login", { message: "Email and password required", user: null });
        }

        const findUser = await User.findOne({ isAdmin: 0, email });
        if (!findUser) {
            return res.render("login", { message: "User not found", user: null });
        }

        if (findUser.isBlocked) {
            return res.render("login", { message: "User blocked", user: null });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render("login", { message: "Incorrect password", user: null });
        }

        req.session.user = findUser._id;
        return res.redirect('/');
    } catch (error) {
        console.error("Login error:", error);
        return res.render("login", { message: "Login failed", user: null });
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error("Session destruction error:", err);
                return res.redirect('/page-not-found');
            }
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
        const userData = user ? await User.findOne({ _id: user }) : null;
        const categories = await Category.find({ isListed: true });
        const categoryIds = categories.map(category => category._id);

        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        const products = await Product.find({
            isActive: true,
            categoryId: { $in: categoryIds },
            'variants.varientquatity': { $gt: 0 }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("categoryId")
        .lean();

        const totalProducts = await Product.countDocuments({
            isActive: true,
            categoryId: { $in: categoryIds },
            'variants.varientquatity': { $gt: 0 }
        });

        const totalPages = Math.ceil(totalProducts / limit);
        const filters = {
            category: req.query.category || 'all',
            size: req.query.size || '',
            color: req.query.color || '',
            minPrice: req.query.minPrice || '',
            maxPrice: req.query.maxPrice || '',
            sort: req.query.sort || 'latest'
        };


        const formattedProducts = products.map(product => {
            const firstVariant = product.variants?.[0] || {};
            const mainImage = product.images?.find(img => img.isMain) || product.images?.[0] || { url: '/images/placeholder.jpg' };
            
     
            const regularPrice = firstVariant.varientPrice || firstVariant.salePrice || 0;
            

            const salePrice = product.offer > 0 
                ? regularPrice * (1 - product.offer / 100)
                : regularPrice;

            return {
                _id: product._id,
                name: product.name,
                images: product.images || [],
                ratings: product.ratings || { average: 0, count: 0 },
                categoryId: product.categoryId,
                offer: product.offer || 0,
                regularPrice: regularPrice,
                salePrice: salePrice,
               
            };
        });

        res.render("allproduct", {
            user: userData,
            products: formattedProducts,
            categories,
            totalProducts,
            currentPage: page,
            totalPages,
            filters
        });
    } catch (error) {
        console.error("Error loading allproduct:", error);
        return res.redirect('/page-not-found');
    }
};
const filterProducts = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = user ? await User.findOne({ _id: user }) : null;
        const { category, minPrice, maxPrice, color, sort, page = 1 } = req.query;
        const limit = 9;
        const skip = (page - 1) * limit;

        const query = { isActive: true };
        if (category && category !== 'all') {
            const selectedCategory = await Category.findOne({ name: category });
            if (selectedCategory) query.categoryId = selectedCategory._id;
        }

        if (minPrice || maxPrice) {
            query['variants.salePrice'] = {};
            if (minPrice) query['variants.salePrice'].$gte = parseFloat(minPrice);
            if (maxPrice) query['variants.salePrice'].$lte = parseFloat(maxPrice);
        }

        if (color) query.color = { $regex: new RegExp(color, 'i') };

        let sortOption = {};
        switch (sort) {
            case 'price-high-low': sortOption = { 'variants.salePrice': -1 }; break;
            case 'price-low-high': sortOption = { 'variants.salePrice': 1 }; break;
            case 'popular': sortOption = { popularity: -1 }; break;
            case 'latest': default: sortOption = { createdAt: -1 };
        }

        const products = await Product.find(query).sort(sortOption).skip(skip).limit(limit).lean();
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);
        const categories = await Category.find({});

        const filters = {
            category: category || 'all',
            size: req.query.size || '',
            color: color || '',
            minPrice: minPrice || '',
            maxPrice: maxPrice || '',
            sort: sort || 'latest'
        };

        const formattedProducts = products.map(product => {
            const firstVariant = product.variants?.[0] || {};
            
          
            const regularPrice = firstVariant.varientPrice || firstVariant.salePrice || 0;
            
           
            const salePrice = product.offer > 0 
                ? regularPrice * (1 - product.offer / 100)
                : regularPrice;

            return {
                ...product,
                salePrice: salePrice,
                regularPrice: regularPrice,
                offer: product.offer || 0
            };
        });

        res.render("allproduct", {
            user: userData,
            products: formattedProducts,
            categories,
            totalProducts,
            currentPage: parseInt(page),
            totalPages,
            filters
        });
    } catch (error) {
        console.error("Error filtering products:", error);
        res.status(500).render("page-404");
    }
};
const aboutUs = async (req,res)=>{
    try {
        res.render("aboutUs")

    } catch (error) {
        console.log("unable to get About us page")
        res.status(500).render("page-404")
    }
}
const searchProducts = async (req, res) => {
    try {
        const query = req.query.query || '';
        const user = req.session.user;
        const userData = user ? await User.findOne({ _id: user }) : null;
        const categories = await Category.find({ isListed: true });
        
      
        const products = await Product.find({
            isActive: true,
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { brand: { $regex: query, $options: 'i' } }
            ]
        })
        .populate("categoryId")
        .lean();
        
        const formattedProducts = products.map(product => {
            const firstVariant = product.variants?.[0] || {};
            
           
            const regularPrice = firstVariant.varientPrice || firstVariant.salePrice || 0;
            const salePrice = product.offer > 0 
                ? regularPrice * (1 - product.offer / 100)
                : regularPrice;

            return {
                _id: product._id,
                name: product.name,
                images: product.images || [],
                ratings: product.ratings || { average: 0, count: 0 },
                categoryId: product.categoryId,
                offer: product.offer || 0,
                regularPrice: regularPrice,
                salePrice: salePrice,
            };
        });

        
        res.render("allproduct", {
            user: userData,
            products: formattedProducts,
            categories,
            totalProducts: products.length,
            currentPage: 1,
            totalPages: 1,
            filters: { category: 'all' },
            searchQuery: query,
            noProductsMessage: products.length === 0 ? `Sorry, no products found for "${query}"` : null
        });
    } catch (error) {
        console.error("Error searching products:", error);
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
    filterProducts,
    aboutUs,
    searchProducts
};