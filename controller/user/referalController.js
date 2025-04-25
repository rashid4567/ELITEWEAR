const User = require("../../model/userSchema");
const Wallet = require("../../model/walletScheema");
const ReferralHistory = require("../../model/refferalHistoryScheema");
const { v4: uuidv4 } = require("uuid");

const REFERRER_REWARD = 200;
const NEW_USER_REWARD = 100;

const loadReferralPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login");
    }

    const userController = require("./userControll");
    const referralStats = await userController.getReferralStats(userId);

    const referralUrl = `${req.protocol}://${req.get(
      "host"
    )}/referralSpace?code=${user.referralCode}`;

    console.log("Loading referral page for user:", userId);
    res.render("referalCode", {
      user,
      referralStats: {
        totalReferrals: referralStats.total,
        totalEarned: referralStats.earnings,
      },
      referralUrl,
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
      console.log("Loading referralSpace for logged in user:", userId);
    } else {
      console.log("Loading referralSpace for non-logged in user");
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
    const referralCode = req.body.referralCode;
    console.log("Validating referral code:", referralCode);

    if (!referralCode) {
      return res.json({ success: false, message: "Referral code is required" });
    }

    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return res.json({ success: false, message: "Invalid referral code" });
    }

    if (req.session.user) {
      const userId = req.session.user;
      if (referrer._id.toString() === userId.toString()) {
        return res.json({
          success: false,
          message: "You cannot use your own referral code",
        });
      }

      const user = await User.findById(userId);
      if (user.referredBy) {
        return res.json({
          success: false,
          message: "You have already used a referral code",
        });
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Error validating referral code:", error.message);
    return res.json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

const processSignupReferral = async (userId, referralCode) => {
  try {
    if (!referralCode) return false;

    const userController = require("./userControll");
    const result = await userController.applyReferral(userId, referralCode);

    return result.success;
  } catch (error) {
    console.error("Error processing signup referral:", error);
    return false;
  }
};

module.exports = {
  loadReferralPage,
  loadReferralSpace,
  validateReferralCode,
  processSignupReferral,
  REFERRER_REWARD,
  NEW_USER_REWARD,
};
