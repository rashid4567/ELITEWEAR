const { render } = require("ejs");
const session = require("express-session");
const bcrypt = require("bcrypt");
require("dotenv").config();
const User = require("../../model/userSchema");
const validator = require("validator");
const crypto = require("crypto");
const Category = require("../../model/categoryScheema");
const Product = require("../../model/productScheema");
const Banner = require("../../model/BannerScheema");
const Wallet = require("../../model/walletScheema");
const ReferralHistory = require("../../model/refferalHistoryScheema");
const Review = require("../../model/ReviewScheema");
const { sendOtpEmail } = require("../../config/mailer");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

const OTP_EXPIRY_MINUTES = 15;
const OTP_LENGTH = 5;
const SALT_ROUNDS = 10;

const REFERRER_REWARD = 200;
const NEW_USER_REWARD = 100;

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
  if (!validator.isEmail(email, { domain_specific_validation: true })) {
    throw new Error("Suspicious email domain");
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

const generateReferralCode = () => {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
};

const getReferralStats = async (userId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error("Invalid userId format:", userId);
      return {
        total: 0,
        earnings: 0,
        pending: 0,
        history: [],
      };
    }

    const totalReferrals = await User.countDocuments({ referredBy: userId });

    const referralHistory = await ReferralHistory.find({ referrerId: userId })
      .populate("newUserId", "fullname email")
      .sort({ date: -1 })
      .limit(10);

    const earnings = referralHistory.reduce(
      (total, record) => total + record.amountToReferrer,
      0
    );

    const history = referralHistory.map((record) => ({
      date: record.date,
      name: record.newUserId ? record.newUserId.fullname : "Unknown User",
      email: record.newUserId ? record.newUserId.email : "",
      status: "completed",
      reward: record.amountToReferrer,
    }));

    return {
      total: totalReferrals,
      earnings,
      pending: 0,
      history,
    };
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return {
      total: 0,
      earnings: 0,
      pending: 0,
      history: [],
    };
  }
};

const applyReferral = async (newUserId, referralCode) => {
  try {
    if (!newUserId || !referralCode) {
      return { success: false, message: "Missing required parameters" };
    }

    if (!mongoose.Types.ObjectId.isValid(newUserId)) {
      return { success: false, message: "Invalid user ID format" };
    }

    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return { success: false, message: "Invalid referral code" };
    }

    if (referrer._id.toString() === newUserId.toString()) {
      return { success: false, message: "Cannot use your own referral code" };
    }

    const user = await User.findById(newUserId);
    if (!user) {
      return { success: false, message: "User not found" };
    }

    if (user.referredBy) {
      return {
        success: false,
        message: "You have already used a referral code",
      };
    }

    const baseTransactionRef = `REF-${Date.now()}-${Math.floor(
      Math.random() * 1000
    )}`;
    const newUserTransactionRef = `${baseTransactionRef}-NEW`;
    const referrerTransactionRef = `${baseTransactionRef}-REF`;

    const newUserWallet = await Wallet.findOneAndUpdate(
      { userId: newUserId },
      {
        $inc: { amount: NEW_USER_REWARD },
        $push: {
          transactions: {
            type: "credit",
            amount: NEW_USER_REWARD,
            transactionRef: newUserTransactionRef,
            description: "Referral bonus for signing up",
            date: new Date(),
          },
        },
      },
      { new: true, upsert: true }
    );

    const referrerWallet = await Wallet.findOneAndUpdate(
      { userId: referrer._id },
      {
        $inc: { amount: REFERRER_REWARD },
        $push: {
          transactions: {
            type: "credit",
            amount: REFERRER_REWARD,
            transactionRef: referrerTransactionRef,
            description: `Referral bonus for inviting ${
              user.fullname || "a new user"
            }`,
            date: new Date(),
          },
        },
      },
      { new: true, upsert: true }
    );

    await User.findByIdAndUpdate(newUserId, { referredBy: referrer._id });

    const referralHistory = new ReferralHistory({
      newUserId,
      referrerId: referrer._id,
      amountToNewUser: NEW_USER_REWARD,
      amountToReferrer: REFERRER_REWARD,
      date: new Date(),
    });
    await referralHistory.save();

    return {
      success: true,
      message: "Referral applied successfully",
      newUserReward: NEW_USER_REWARD,
      referrerReward: REFERRER_REWARD,
    };
  } catch (error) {
    console.error("Error applying referral:", error.message);
    return { success: false, message: "Server error: " + error.message };
  }
};

const applyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    if (!referralCode) {
      return res
        .status(400)
        .json({ success: false, message: "Referral code is required" });
    }

    const result = await applyReferral(userId, referralCode);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error applying referral code:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
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
    const userData = userId ? await User.findById(userId) : null;
    const today = new Date().toISOString();

    
    const findBanner = await Banner.find({
      startingDate: { $lt: new Date(today) },
      endingDate: { $gt: new Date(today) },
    });

    const categories = await Category.find({ isListed: true });
    const categoryIds = categories.map((category) => category._id);

    
    const productData = await Product.find({
      isActive: true,
      categoryId: { $in: categoryIds },
    })
      .sort({ createdAt: -1 })
      .limit(12)
      .populate("categoryId")
      .exec();

    
    const formattedProductData = productData.map((product) => {
      const firstVariant = product.variants?.[0] || {};
      return {
        _id: product._id,
        name: product.name,
        images: product.images || [],
        salePrice: firstVariant.salePrice || 0,
        variants: product.variants || [],
        ratings: product.ratings || { average: 0, count: 0 },
      };
    });


    const topReviews = await Review.find({
      rating: { $gte: 4 }, 
    })
      .sort({
        helpfulVotes: -1, 
        createdAt: -1,
      })
      .limit(6) 
      .populate("userId", "fullname profileImage") 
      .populate("productId", "name")
      .lean();

    res.render("home", {
      user: userData,
      data: formattedProductData,
      cat: categories,
      Banner: findBanner || [],
      reviews: topReviews || [], 
      error: formattedProductData.length === 0 ? "No products available" : null,
    });
  } catch (error) {
    console.error("Error loading home page:", error);
    res.render("home", {
      user: null,
      data: [],
      cat: [],
      Banner: [],
      reviews: [], 
      error: "Server error",
    });
  }
};
const checkBlockedStatus = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (userId) {
      const user = await User.findById(userId);
      if (user && user.isBlocked) {
        req.session.destroy((err) => {
          if (err) {
            console.error("Session destruction error:", err);
            return res.redirect("/page-not-found");
          }
          return res.redirect("/login");
        });
      } else {
        next();
      }
    } else {
      next();
    }
  } catch (error) {
    console.error("Error checking blocked status:", error);
    res.redirect("/page-not-found");
  }
};

const loadUserSignup = async (req, res) => {
  try {
    const errorMessage =
      req.flash("error").length > 0 ? req.flash("error")[0] : null;
    const referralCode = req.query.referral || null;

    res.render("signup", {
      user: null,
      message: errorMessage || null,
      formData: {},
      referralCode,
    });
  } catch (error) {
    console.error("Signup page error:", error);
    res.status(500).send("Server issue");
  }
};

const userSignup = async (req, res) => {
  try {
    const { fullname, email, mobile, password, cpassword, referralCode } =
      req.body;

    const normalizedEmail = email.toLowerCase();

    if (password !== cpassword) {
      return res.render("signup", {
        message: "Passwords do not match",
        user: null,
        formData: { fullname, email: normalizedEmail, mobile },
        referralCode,
      });
    }

    validateEmail(normalizedEmail);

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { mobile }],
    });

    if (existingUser) {
      return res.render("signup", {
        message:
          existingUser.email === normalizedEmail
            ? "User with this email already exists"
            : "User with this mobile number already exists",
        user: null,
        formData: { fullname, email: normalizedEmail, mobile },
        referralCode,
      });
    }

    const otp = generateOtp();

    const emailResult = await sendVerificationEmail(normalizedEmail, otp);

    if (!emailResult.success) {
      return res.render("signup", {
        message: "Failed to send verification email",
        user: null,
        formData: { fullname, email: normalizedEmail, mobile },
        referralCode,
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const userReferralCode = generateReferralCode();

    req.session.registration = {
      otp,
      userData: {
        fullname,
        email: normalizedEmail,
        mobile,
        password: hashedPassword,
        referralCode,
        userReferralCode,
      },
      otpExpires: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    };

    return res.redirect("/verify-otp");
  } catch (error) {
    console.error("Signup error:", error);
    return res.render("signup", {
      message: error.message || "Registration failed",
      user: null,
      formData: { ...req.body, email: req.body.email.toLowerCase() },
      referralCode: req.body.referralCode,
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
        message: "Session expired. Please register again.",
      });
    }

    if (Date.now() > registration.otpExpires) {
      delete req.session.registration;
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    if (otp !== registration.otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    const newUser = new User({
      fullname: registration.userData.fullname,
      email: registration.userData.email,
      mobile: registration.userData.mobile,
      password: registration.userData.password,
      isVerified: true,
      referralCode: registration.userData.userReferralCode,
    });

    await newUser.save();

    const wallet = new Wallet({
      userId: newUser._id,
      amount: 0,
    });
    await wallet.save();

    let referralResult = { success: false };
    if (registration.userData.referralCode) {
      referralResult = await applyReferral(
        newUser._id,
        registration.userData.referralCode
      );

      if (referralResult.success) {
        console.log(
          `Referral applied successfully during signup for user: ${newUser._id}`
        );
      } else {
        console.log(
          `Referral failed for user: ${newUser._id}. Reason: ${referralResult.message}`
        );
      }
    }

    req.session.user = newUser._id;
    delete req.session.registration;

    return res.json({
      success: true,
      referralApplied: referralResult.success,
      referralMessage: referralResult.message,
      redirectUrl: "/",
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Verification error: " + error.message,
    });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { registration } = req.session;

    if (!registration?.userData?.email) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please register again.",
      });
    }

    const newOtp = generateOtp();

    const emailResult = await sendVerificationEmail(
      registration.userData.email,
      newOtp
    );

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to resend OTP",
      });
    }

    req.session.registration.otp = newOtp;
    req.session.registration.otpExpires =
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

    return res.json({
      success: true,
      message: "New OTP sent successfully",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const userLogin = async (req, res) => {
  try {
    if (req.session.user) {
      return res.redirect("/");
    }
    return res.render("login", { user: null, message: null });
  } catch (error) {
    console.error("Login page error:", error);
    res.status(500).send("Server issue");
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render("login", {
        user: null,
        message: "Email and password are required",
      });
    }

    const lowerEmail = email.toLowerCase();

    const findUser = await User.findOne({
      email: lowerEmail,
      isAdmin: false,
    });

    if (!findUser) {
      return res.render("login", {
        user: null,
        message: "User not found",
      });
    }

    if (findUser.isBlocked) {
      return res.render("login", {
        user: null,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    if (!passwordMatch) {
      return res.render("login", {
        user: null,
        message: "Incorrect password",
      });
    }

    req.session.user = findUser._id;
    return res.redirect("/");
  } catch (error) {
    console.error("Login error:", error);
    return res.render("login", {
      user: null,
      message: "Login failed due to server error",
    });
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error:", err);
        return res.redirect("/page-not-found");
      }
      res.redirect("/login");
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.redirect("/page-not-found");
  }
};

const allproduct = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findOne({ _id: user }) : null;
    const categories = await Category.find({ isListed: true });
    const categoryIds = categories.map((category) => category._id);

    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const products = await Product.find({
      isActive: true,
      categoryId: { $in: categoryIds },
      "variants.varientquatity": { $gt: 0 },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("categoryId")
      .lean();

    const totalProducts = await Product.countDocuments({
      isActive: true,
      categoryId: { $in: categoryIds },
      "variants.varientquatity": { $gt: 0 },
    });

    const totalPages = Math.ceil(totalProducts / limit);
    const filters = {
      category: req.query.category || "all",
      size: req.query.size || "",
      color: req.query.color || "",
      minPrice: req.query.minPrice || "",
      maxPrice: req.query.maxPrice || "",
      sort: req.query.sort || "latest",
    };

    const formattedProducts = products.map((product) => {
      const firstVariant = product.variants?.[0] || {};
      const regularPrice =
        firstVariant.varientPrice || firstVariant.salePrice || 0;

      const salePrice =
        product.offer > 0
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
      filters,
    });
  } catch (error) {
    console.error("Error loading allproduct:", error);
    return res.redirect("/page-not-found");
  }
};

const filterProducts = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findOne({ _id: user }) : null;
    const {
      category,
      minPrice,
      maxPrice,
      color,
      size,
      sort,
      page = 1,
    } = req.query;
    const limit = 9;
    const skip = (page - 1) * limit;

    const query = {
      isActive: true,
      "variants.varientquatity": { $gt: 0 },
    };

    if (category && category !== "all") {
      const selectedCategory = await Category.findOne({ name: category });
      if (selectedCategory) query.categoryId = selectedCategory._id;
    }

    if (size) {
      query["variants.size"] = size;
    }

    if (minPrice || maxPrice) {
      query["variants.salePrice"] = {};
      if (minPrice) query["variants.salePrice"].$gte = parseFloat(minPrice);
      if (maxPrice) query["variants.salePrice"].$lte = parseFloat(maxPrice);
    }

    if (color) query.color = { $regex: new RegExp(color, "i") };

    let sortOption = {};
    switch (sort) {
      case "price-high-low":
        sortOption = { "variants.salePrice": -1 };
        break;
      case "price-low-high":
        sortOption = { "variants.salePrice": 1 };
        break;
      case "popular":
        sortOption = { popularity: -1 };
        break;
      case "latest":
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);
    const categories = await Category.find({});

    const filters = {
      category: category || "all",
      size: size || "",
      color: color || "",
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      sort: sort || "latest",
    };

    const formattedProducts = products.map((product) => {
      const firstVariant = product.variants?.[0] || {};
      const regularPrice =
        firstVariant.varientPrice || firstVariant.salePrice || 0;
      const salePrice =
        product.offer > 0
          ? regularPrice * (1 - product.offer / 100)
          : regularPrice;

      return {
        _id: product._id,
        name: product.name,
        images: product.images || [],
        ratings: product.ratings || { average: 0, count: 0 },
        offer: product.offer || 0,
        regularPrice: regularPrice,
        salePrice: salePrice,
      };
    });

    if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest") {
      return res.json({
        products: formattedProducts,
        totalProducts,
        currentPage: parseInt(page),
        totalPages,
        filters,
      });
    }

    res.render("allproduct", {
      user: userData,
      products: formattedProducts,
      categories,
      totalProducts,
      currentPage: parseInt(page),
      totalPages,
      filters,
    });
  } catch (error) {
    console.error("Error filtering products:", error);
    if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest") {
      return res.status(500).json({ error: "Server error" });
    }
    res.status(500).render("page-404");
  }
};

const aboutUs = async (req, res) => {
  try {
    res.render("aboutUs");
  } catch (error) {
    console.error("unable to get About us page");
    res.status(500).render("page-404");
  }
};

const searchProducts = async (req, res) => {
  try {
    const {
      query = "",
      page = 1,
      category,
      size,
      minPrice,
      maxPrice,
      sort,
    } = req.query;
    const user = req.session.user;
    const limit = 9;
    const skip = (page - 1) * limit;

    const userData = user ? await User.findOne({ _id: user }) : null;
    const categories = await Category.find({ isListed: true });
    const listCategories = categories.map((cat) => cat._id);

    let searchQuery = {
      isActive: true,
      categoryId: { $in: listCategories },
      "variants.varientquatity": { $gt: 0 },
    };

    if (query.trim()) {
      searchQuery.$or = [
        { name: { $regex: query, $options: "i" } },
        { brand: { $regex: query, $options: "i" } },
      ];
    }

    if (category && category !== "all") {
      const selectedCategory = await Category.findOne({ name: category });
      if (selectedCategory) searchQuery.categoryId = selectedCategory._id;
    }

    if (size) {
      searchQuery["variants.size"] = size;
    }

    if (minPrice || maxPrice) {
      searchQuery["variants.salePrice"] = {};
      if (minPrice)
        searchQuery["variants.salePrice"].$gte = parseFloat(minPrice);
      if (maxPrice)
        searchQuery["variants.salePrice"].$lte = parseFloat(maxPrice);
    }

    let sortOption = {};
    switch (sort) {
      case "price-high-low":
        sortOption = { "variants.salePrice": -1 };
        break;
      case "price-low-high":
        sortOption = { "variants.salePrice": 1 };
        break;
      case "popular":
        sortOption = { popularity: -1 };
        break;
      case "latest":
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(searchQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate("categoryId")
      .lean();

    const totalProducts = await Product.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalProducts / limit);

    const formattedProducts = products.map((product) => {
      const firstVariant = product.variants?.[0] || {};
      const regularPrice =
        firstVariant.varientPrice || firstVariant.salePrice || 0;
      const salePrice =
        product.offer > 0
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

    const responseData = {
      products: formattedProducts,
      totalProducts,
      currentPage: parseInt(page),
      totalPages,
      filters: {
        category: category || "all",
        size: size || "",
        minPrice: minPrice || "",
        maxPrice: maxPrice || "",
        sort: sort || "latest",
      },
      searchQuery: query,
      noProductsMessage:
        totalProducts === 0
          ? query.trim()
            ? `Sorry, no products found for "${query}"`
            : "No products found matching your criteria."
          : null,
    };

    if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest") {
      return res.json(responseData);
    }

    res.render("allproduct", {
      user: userData,
      categories,
      ...responseData,
    });
  } catch (error) {
    console.error("Error searching products:", error);
    if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest") {
      return res.status(500).json({ error: "Server error" });
    }
    return res.redirect("/page-not-found");
  }
};

const loadReferralPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/login?redirect=/referrals");
    }

    const user = await User.findById(userId);
    if (!user) {
      req.session.destroy();
      return res.redirect("/login");
    }

    const stats = await getReferralStats(userId);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const referralLink = `${baseUrl}/signup?referral=${user.referralCode}`;

    res.render("referrals", {
      user,
      stats,
      referralLink,
      message: null,
    });
  } catch (error) {
    console.error("Error loading referral page:", error);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

const getUserReferralHistory = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const referralHistory = await ReferralHistory.find({ referrerId: userId })
      .populate("newUserId", "fullname email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await ReferralHistory.countDocuments({ referrerId: userId });

    const history = referralHistory.map((record) => ({
      date: record.date,
      name: record.newUserId ? record.newUserId.fullname : "Unknown User",
      email: record.newUserId ? record.newUserId.email : "",
      status: "completed",
      reward: record.amountToReferrer,
    }));

    res.json({
      success: true,
      history,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get user referral history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get referral history: " + error.message,
    });
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
  searchProducts,
  checkBlockedStatus,
  getReferralStats,
  applyReferral,
  applyReferralCode,
  loadReferralPage,
  getUserReferralHistory,
  REFERRER_REWARD,
  NEW_USER_REWARD,
};
