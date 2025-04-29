const User = require("../model/userSchema");
const Wallet = require("../model/walletScheema");
const ReferralHistory = require("../model/refferalHistoryScheema");
const { v4: uuidv4 } = require("uuid");

const REFERRER_REWARD = 200;
const NEW_USER_REWARD = 100;

const validateReferralCode = async (referralCode, currentUserId = null) => {
  try {
    if (!referralCode) {
      return { success: false, message: "Referral code is required" };
    }

    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return { success: false, message: "Invalid referral code" };
    }

    if (currentUserId) {
      if (referrer._id.toString() === currentUserId.toString()) {
        return {
          success: false,
          message: "You cannot use your own referral code",
        };
      }

      const user = await User.findById(currentUserId);
      if (user && user.referredBy) {
        return {
          success: false,
          message: "You have already used a referral code",
        };
      }
    }

    return {
      success: true,
      message: "Valid referral code",
      referrerId: referrer._id,
      referrerName: referrer.fullname,
      rewardAmount: NEW_USER_REWARD,
    };
  } catch (error) {
    console.error("Error validating referral code:", error);
    return { success: false, message: "Server error: " + error.message };
  }
};

const applyReferral = async (newUserId, referralCode) => {
  try {
    console.log(
      `Applying referral for user: ${newUserId} with code: ${referralCode}`
    );

    if (!newUserId || !referralCode) {
      console.log("Missing required parameters:", { newUserId, referralCode });
      return { success: false, message: "Missing required parameters" };
    }

    const validationResult = await validateReferralCode(
      referralCode,
      newUserId
    );
    if (!validationResult.success) {
      return validationResult;
    }

    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      console.log("Invalid referral code:", referralCode);
      return { success: false, message: "Invalid referral code" };
    }

    const user = await User.findById(newUserId);
    if (!user) {
      console.log("User not found:", newUserId);
      return { success: false, message: "User not found" };
    }

    const baseTransactionRef = `REF-${Date.now()}-${Math.floor(
      Math.random() * 1000
    )}`;
    const newUserTransactionRef = `${baseTransactionRef}-NEW`;
    const referrerTransactionRef = `${baseTransactionRef}-REF`;

    try {
      const newUserWallet = await Wallet.findOneAndUpdate(
        { userId: newUserId },
        {
          $setOnInsert: { userId: newUserId, amount: 0, transactions: [] },
          $inc: { amount: NEW_USER_REWARD },
          $push: {
            transactions: {
              type: "credit",
              amount: NEW_USER_REWARD,
              transactionRef: newUserTransactionRef,
              description: `Referral bonus for signing up with code ${referralCode}`,
              date: new Date(),
            },
          },
        },
        { new: true, upsert: true }
      );

      console.log(
        `Added ${NEW_USER_REWARD} to new user wallet. New balance: ${newUserWallet.amount}`
      );

      const referrerWallet = await Wallet.findOneAndUpdate(
        { userId: referrer._id },
        {
          $setOnInsert: { userId: referrer._id, amount: 0, transactions: [] },
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

      console.log(
        `Added ${REFERRER_REWARD} to referrer wallet. New balance: ${referrerWallet.amount}`
      );

      user.referredBy = referrer._id;
      await user.save();

      console.log(`Updated user ${newUserId} with referrer ${referrer._id}`);

      const referralHistory = new ReferralHistory({
        newUserId,
        referrerId: referrer._id,
        amountToNewUser: NEW_USER_REWARD,
        amountToReferrer: REFERRER_REWARD,
        date: new Date(),
      });
      await referralHistory.save();

      console.log(`Created referral history record: ${referralHistory._id}`);

      return {
        success: true,
        message: "Referral applied successfully",
        newUserReward: NEW_USER_REWARD,
        referrerReward: REFERRER_REWARD,
        newUserWalletBalance: newUserWallet.amount,
        referrerWalletBalance: referrerWallet.amount,
        referralHistoryId: referralHistory._id,
      };
    } catch (error) {
      console.error("Error processing referral rewards:", error);
      return {
        success: false,
        message: "Failed to process referral rewards: " + error.message,
      };
    }
  } catch (error) {
    console.error("Error applying referral:", error);
    return { success: false, message: "Server error: " + error.message };
  }
};

const getReferralStats = async (userId) => {
  try {
    console.log(`Getting referral stats for user: ${userId}`);

    const totalReferrals = await User.countDocuments({ referredBy: userId });

    const referralHistory = await ReferralHistory.find({ referrerId: userId });

    const earnings = referralHistory.reduce(
      (total, record) => total + record.amountToReferrer,
      0
    );

    const recentReferrals = await ReferralHistory.find({ referrerId: userId })
      .populate("newUserId", "fullname email")
      .sort({ date: -1 })
      .limit(5);

    return {
      total: totalReferrals,
      earnings,
      pending: 0,
      recentReferrals,
    };
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return {
      total: 0,
      earnings: 0,
      pending: 0,
      recentReferrals: [],
    };
  }
};

const generateReferralLink = (referralCode, baseUrl) => {
  return `${baseUrl}/signup?referral=${referralCode}`;
};

const processSignupReferral = async (userId, referralCode) => {
  try {
    console.log(
      `Processing signup referral for user: ${userId} with code: ${referralCode}`
    );

    if (!referralCode) {
      return { success: false, message: "No referral code provided" };
    }

    return await applyReferral(userId, referralCode);
  } catch (error) {
    console.error("Error processing signup referral:", error);
    return {
      success: false,
      message: "Error processing referral: " + error.message,
    };
  }
};

const getReferralHistory = async (userId, page = 1, limit = 10) => {
  try {
    console.log(
      `Getting referral history for user: ${userId}, page: ${page}, limit: ${limit}`
    );

    const skip = (page - 1) * limit;

    // Get referrals made by this user
    const referralsGiven = await ReferralHistory.find({ referrerId: userId })
      .populate("newUserId", "fullname email createdAt")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const totalReferrals = await ReferralHistory.countDocuments({
      referrerId: userId,
    });

    const user = await User.findById(userId);
    let referredBy = null;

    if (user && user.referredBy) {
      const referrerUser = await User.findById(user.referredBy);
      if (referrerUser) {
        referredBy = {
          id: referrerUser._id,
          name: referrerUser.fullname,
          email: referrerUser.email,
          referralCode: referrerUser.referralCode,
        };
      }
    }

    return {
      success: true,
      referralsGiven,
      referredBy,
      pagination: {
        total: totalReferrals,
        page,
        limit,
        pages: Math.ceil(totalReferrals / limit),
      },
    };
  } catch (error) {
    console.error("Error getting referral history:", error);
    return {
      success: false,
      message: "Error retrieving referral history: " + error.message,
      referralsGiven: [],
      referredBy: null,
      pagination: {
        total: 0,
        page,
        limit,
        pages: 0,
      },
    };
  }
};

module.exports = {
  validateReferralCode,
  applyReferral,
  getReferralStats,
  generateReferralLink,
  processSignupReferral,
  getReferralHistory,
  REFERRER_REWARD,
  NEW_USER_REWARD,
};
