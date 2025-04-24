const mongoose = require("mongoose")

const couponSchema = new mongoose.Schema(
  {
    coupencode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    couponpercent: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    minimumPurchase: {
      type: Number,
      default: 0,
      min: 0,
    },
    startingDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    limit: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxRedeemable: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        usedCount: {
          type: Number,
          default: 1,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
)

couponSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate()


    if (update.$set?.startingDate || update.$set?.expiryDate) {
      const query = this.getQuery()
      let startDate, expiryDate


      if (update.$set?.startingDate) {
        startDate = update.$set.startingDate
      } else {
    
        const coupon = await mongoose.model("Coupon").findOne(query)
        if (coupon) {
          startDate = coupon.startingDate
        }
      }


      if (update.$set?.expiryDate) {
        expiryDate = update.$set.expiryDate
      } else if (update.$set?.startingDate) {

        const coupon = await mongoose.model("Coupon").findOne(query)
        if (coupon) {
          expiryDate = coupon.expiryDate
        }
      }


      if (startDate && expiryDate) {
        if (new Date(expiryDate) <= new Date(startDate)) {
          return next(new Error("Expiry date must be after start date"))
        }
      }
    }

    next()
  } catch (error) {
    console.error("Error in coupon pre-save hook:", error)
    next(error)
  }
})

module.exports = mongoose.model("Coupon", couponSchema)
