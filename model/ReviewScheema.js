const mongoose = require("mongoose")
const Schema = mongoose.Schema

const reviewSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    orderItemId: {
      type: Schema.Types.ObjectId,
      ref: "OrderItem",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    review: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    isRejected: {
      type: Boolean,
      default: false,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

// Compound index to ensure a user can only review a product once per order item
reviewSchema.index({ userId: 1, productId: 1, orderItemId: 1 }, { unique: true })

// Pre-save hook to update product ratings
reviewSchema.pre("save", async function (next) {
  try {
    this.updatedAt = Date.now()

    // Only update product ratings if the review is approved and it's either new or the rating changed
    if (this.isApproved && (this.isNew || this.isModified("rating") || this.isModified("isApproved"))) {
      const Product = mongoose.model("Product")
      const product = await Product.findById(this.productId)

      if (product) {
        // Get all approved reviews for this product
        const Review = mongoose.model("Review")
        const approvedReviews = await Review.find({
          productId: this.productId,
          isApproved: true,
          isRejected: false,
        })

        // Calculate new average rating
        const totalRating = approvedReviews.reduce((sum, review) => sum + review.rating, 0)
        const averageRating = approvedReviews.length > 0 ? totalRating / approvedReviews.length : 0

        // Update product ratings
        product.ratings.average = Number.parseFloat(averageRating.toFixed(1))
        product.ratings.count = approvedReviews.length

        await product.save()
      }
    }

    next()
  } catch (error) {
    next(error)
  }
})

module.exports = mongoose.model("Review", reviewSchema)
