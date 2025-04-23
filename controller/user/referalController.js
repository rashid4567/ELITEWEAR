const User = require("../../model/userSchema")
const Wallet = require("../../model/walletScheema")
const ReferralHistory = require("../../model/referralHistorySchema")
const mongoose = require("mongoose")
const { v4: uuidv4 } = require("uuid")

const debug = (...args) => console.log("[REFERRAL_DEBUG]", ...args)


const loadReferralPage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)

 
    const referralStats = await getReferralStats(req.user._id)

    debug("Loading referral page for user:", user._id)
    res.render("referalCode", {
      user,
      referralStats,
      message: null,
    })
  } catch (error) {
    console.error("Error loading referral page:", error)
    res.status(500).render("page-500", { message: "Server issue" })
  }
}


const getReferralStats = async (userId) => {
  try {
   
    const totalReferrals = await User.countDocuments({ referredBy: userId })


    const referralHistory = await ReferralHistory.find({ referrerId: userId })
    const earnings = referralHistory.reduce((total, record) => total + record.amountToReferrer, 0)


    const pendingReferrals = 0

    return {
      total: totalReferrals,
      earnings,
      pending: pendingReferrals,
    }
  } catch (error) {
    console.error("Error getting referral stats:", error)
    return {
      total: 0,
      earnings: 0,
      pending: 0,
    }
  }
}

const loadReferralSpace = async (req, res) => {
  try {

    const userId = req.session.user
    let user = null
    let wallet = null

    if (userId) {
      user = await User.findById(userId)
      wallet = await Wallet.findOne({ userId }).lean()
      debug("Loading referralSpace for logged in user:", userId, "Wallet:", wallet)
    } else {
      debug("Loading referralSpace for non-logged in user")
    }

    res.render("referalSpace", {
      user,
      wallet: wallet || { amount: 0, transactions: [] },
      message: req.query.message || null,
    })
  } catch (error) {
    console.error("Error loading referralSpace:", error)
    res.status(500).render("page-500", { message: "Server issue" })
  }
}


const validateReferralCode = async (req, res) => {
  try {
    const referralCode = req.body.referralCode
    debug("Validating referral code:", referralCode)

    if (!referralCode) {
      return res.json({ success: false, message: "Referral code is required" })
    }

    const referrer = await User.findOne({ referralCode })
    if (!referrer) {
      return res.json({ success: false, message: "Invalid referral code" })
    }


    if (req.session.user) {
      const userId = req.session.user
      if (referrer._id.toString() === userId.toString()) {
        return res.json({ success: false, message: "You cannot use your own referral code" })
      }


      const user = await User.findById(userId)
      if (user.referredBy) {
        return res.json({ success: false, message: "You have already used a referral code" })
      }
    }

    return res.json({ success: true })
  } catch (error) {
    console.error("Error validating referral code:", error.message)
    return res.json({ success: false, message: "Server error: " + error.message })
  }
}


const applyReferral = async (newUserId, referralCode) => {
  try {
    debug("Applying referral for new user:", newUserId, "with referral code:", referralCode)

    const referrer = await User.findOne({ referralCode })
    if (!referrer) {
      debug("Invalid referral code:", referralCode)
      return { success: false, message: "Invalid referral code" }
    }

    if (referrer._id.toString() === newUserId.toString()) {
      debug("User attempted to use own referral code:", newUserId)
      return { success: false, message: "Cannot use your own referral code" }
    }

    const user = await User.findById(newUserId)
    if (user.referredBy) {
      debug("User already used a referral code:", user.referredBy)
      return { success: false, message: "You have already used a referral code" }
    }


    const session = await mongoose.startSession()
    session.startTransaction()

    try {

      debug("Crediting 100 rupees to new user:", newUserId)
      const newUserWallet = await Wallet.findOneAndUpdate(
        { userId: newUserId },
        {
          $setOnInsert: { userId: newUserId, amount: 0, transactions: [] },
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
        { new: true, upsert: true, session },
      )
      debug("New user wallet updated:", JSON.stringify(newUserWallet, null, 2))


      debug("Crediting 200 rupees to referrer:", referrer._id)
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
        { new: true, upsert: true, session },
      )
      debug("Referrer wallet updated:", JSON.stringify(referrerWallet, null, 2))


      await User.findByIdAndUpdate(newUserId, { referredBy: referrer._id }, { session })
      debug("Updated referredBy for user:", newUserId, "to referrer:", referrer._id)

    
      const referralHistory = new ReferralHistory({
        newUserId,
        referrerId: referrer._id,
        amountToNewUser: 100,
        amountToReferrer: 200,
        date: new Date(),
      })
      await referralHistory.save({ session })
      debug("Referral history saved:", JSON.stringify(referralHistory, null, 2))


      await session.commitTransaction()
      session.endSession()

      return { success: true, message: "Referral applied successfully" }
    } catch (error) {

      await session.abortTransaction()
      session.endSession()
      throw error
    }
  } catch (error) {
    console.error("Error applying referral:", error.message)
    return { success: false, message: "Server error: " + error.message }
  }
}

module.exports = {
  loadReferralPage,
  loadReferralSpace,
  validateReferralCode,
  applyReferral,
}
