const User = require("../../model/userSchema");
const Wallet = require("../../model/walletScheema");
const { v4: uuidv4 } = require("uuid");

const debug = (...args) => console.log("[REFERRAL_DEBUG]", ...args);

const loadReferralPage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    debug("Loading referral page for user:", user._id);
    res.render("referalCode", { user, message: null });
  } catch (error) {
    console.error("Error loading referral page:", error);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

const loadReferralSpace = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);
    const wallet = await Wallet.findOne({ userId }).lean();
    debug("Loading referralSpace for user:", userId, "Wallet:", wallet);

    res.render("referalSpace", {
      user,
      wallet: wallet || { amount: 0, transactions: [] },
      message: req.query.message || null,
    });
  } catch (error) {
    console.error("Error loading referralSpace:", error);
    res.status(500).render("page-500", { message: "Server issue" });
  }
};

const validateReferralCode = async (req, res) => {
  try {
    const referralCode = req.body?.referralCode || req.session.referredByCode;
    const userId = req.session.user;
    debug("Validating referral code:", referralCode, "for user:", userId, "Method:", req.method);

    if (!userId) {
      debug("No user session found");
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    if (!referralCode) {
      debug("No referral code provided");
      return req.method === "POST"
        ? res.json({ success: false, message: "Referral code is required" })
        : res.redirect("/referalSpace?message=No referral code provided");
    }

    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      debug("Invalid referral code:", referralCode);
      delete req.session.referredByCode;
      return req.method === "POST"
        ? res.json({ success: false, message: "Invalid referral code" })
        : res.redirect("/referalSpace?message=Invalid referral code");
    }

    if (referrer._id.toString() === userId) {
      debug("User attempted to use own referral code:", userId);
      delete req.session.referredByCode;
      return req.method === "POST"
        ? res.json({ success: false, message: "Cannot use your own referral code" })
        : res.redirect("/referalSpace?message=Cannot use your own referral code");
    }

    // Check if user already used a referral code
    const user = await User.findById(userId);
    if (user.referredBy) {
      debug("User already used a referral code:", user.referredBy);
      delete req.session.referredByCode;
      return req.method === "POST"
        ? res.json({ success: false, message: "You have already used a referral code" })
        : res.redirect("/referalSpace?message=You have already used a referral code");
    }

    // Credit new user wallet (100 rupees)
    debug("Crediting 100 rupees to new user:", userId);
    const newUserWallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId, amount: 0, transactions: [] },
        $inc: { amount: 100 },
        $push: {
          transactions: {
            type: "credit",
            amount: 100,
            transactionRef: `TXN-${uuidv4()}`,
            description: "Referral bonus for signing up",
            date: new Date(),
          },
        },
      },
      { new: true, upsert: true }
    );
    debug("New user wallet updated:", JSON.stringify(newUserWallet, null, 2));

    // Credit referrer wallet (200 rupees)
    debug("Crediting 200 rupees to referrer:", referrer._id);
    const referrerWallet = await Wallet.findOneAndUpdate(
      { userId: referrer._id },
      {
        $setOnInsert: { userId: referrer._id, amount: 0, transactions: [] },
        $inc: { amount: 200 },
        $push: {
          transactions: {
            type: "credit",
            amount: 200,
            transactionRef: `TXN-${uuidv4()}`,
            description: "Referral bonus for inviting a friend",
            date: new Date(),
          },
        },
      },
      { new: true, upsert: true }
    );
    debug("Referrer wallet updated:", JSON.stringify(referrerWallet, null, 2));

    // Update user's referredBy field
    await User.findByIdAndUpdate(userId, {
      referredBy: referrer._id,
    });
    debug("Updated referredBy for user:", userId, "to referrer:", referrer._id);

    delete req.session.referredByCode;
    debug("Cleared referredByCode from session");

    return req.method === "POST"
      ? res.json({ success: true, redirectUrl: "/referalSpace?message=Referral applied successfully" })
      : res.redirect("/referalSpace?message=Referral applied successfully");
  } catch (error) {
    console.error("Error validating referral code:", error.message);
    debug("Error details:", error);
    delete req.session.referredByCode;
    return req.method === "POST"
      ? res.json({ success: false, message: "Server error: " + error.message })
      : res.redirect("/referalSpace?message=Server error: " + error.message);
  }
};

module.exports = {
  loadReferralPage,
  loadReferralSpace,
  validateReferralCode,
};