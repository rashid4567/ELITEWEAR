const referralHandler = require("../../utils/refferalHandlers");
const User = require("../../model/userSchema");
const Wallet = require("../../model/walletScheema");

const loadReferralPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/login?redirect=/referral");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login");
    }

    const referralStats = await referralHandler.getReferralStats(userId);

    const referralUrl = referralHandler.generateReferralLink(
      user.referralCode,
      `${req.protocol}://${req.get("host")}`
    );

    res.render("referalCode", {
      user,
      referralStats: {
        totalReferrals: referralStats.total,
        totalEarned: referralStats.earnings,
      },
      referralUrl,
      recentReferrals: referralStats.recentReferrals || [],
      message: null,
    });
  } catch (error) {
    console.error("Error loading referral page:", error);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

const loadReferralSpace = async (req, res) => {
  try {
    const userId = req.session.user;
    let user = null;
    let wallet = null;
    const referralCode = req.query.code || "";

    if (userId) {
      user = await User.findById(userId);
      wallet = await Wallet.findOne({ userId }).lean();
    }
    res.render("referalSpace", {
      user,
      wallet: wallet || { amount: 0, transactions: [] },
      referralCode,
      message: req.query.message || null,
    });
  } catch (error) {
    console.error("Error loading referralSpace:", error);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

const validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const userId = req.session.user || null;

    const result = await referralHandler.validateReferralCode(
      referralCode,
      userId
    );
    return res.json(result);
  } catch (error) {
    console.error("Error validating referral code:", error.message);
    return res.json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

const processSignupReferral = async (req, res) => {
  try {
    const { userId, referralCode } = req.body;

    if (!userId || !referralCode) {
      return res.status(400).json({
        success: false,
        message: "User ID and referral code are required",
      });
    }

    const result = await referralHandler.processSignupReferral(
      userId,
      referralCode
    );
    return res.json(result);
  } catch (error) {
    console.error("Error processing signup referral:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

const applyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        message: "Referral code is required",
      });
    }

    const result = await referralHandler.applyReferral(userId, referralCode);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error applying referral code:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

const getReferralStats = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const stats = await referralHandler.getReferralStats(userId);
    return res.json({ success: true, stats });
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

const getReferralHistory = async (req, res) => {
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

    const history = await referralHandler.getReferralHistory(
      userId,
      page,
      limit
    );
    return res.json(history);
  } catch (error) {
    console.error("Error getting referral history:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

module.exports = {
  loadReferralPage,
  loadReferralSpace,
  validateReferralCode,
  processSignupReferral,
  applyReferralCode,
  getReferralStats,
  getReferralHistory,
  REFERRER_REWARD: referralHandler.REFERRER_REWARD,
  NEW_USER_REWARD: referralHandler.NEW_USER_REWARD,
};
