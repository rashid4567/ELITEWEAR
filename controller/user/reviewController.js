const Review = require("../../model/ReviewScheema")
const Product = require("../../model/productScheema")
const Order = require("../../model/orderSchema")
const OrderItem = require("../../model/orderItemSchema")
const User = require("../../model/userSchema")
const mongoose = require("mongoose")

// Check if user can review a product
const canReviewProduct = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id
    const { productId, orderItemId } = req.params

    // Verify the order item exists and belongs to the user
    const orderItem = await OrderItem.findById(orderItemId).populate("orderId")

    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      })
    }

    // Verify the order belongs to the user
    if (orderItem.orderId.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to review this product",
      })
    }

    // Verify the product ID matches
    if (orderItem.productId.toString() !== productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID doesn't match the order item",
      })
    }

    // Check if the order item is delivered
    if (orderItem.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "You can only review products that have been delivered",
      })
    }

    // Check if the user has already reviewed this product for this order item
    const existingReview = await Review.findOne({
      userId,
      productId,
      orderItemId,
    })

    return res.status(200).json({
      success: true,
      canReview: !existingReview,
      existingReview: existingReview,
    })
  } catch (error) {
    console.error("Error checking review eligibility:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to check review eligibility",
    })
  }
}

// Submit a product review
const submitReview = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id
    const { productId, orderItemId } = req.params
    const { rating, title, review } = req.body

    // Validate input
    if (!rating || !title || !review) {
      return res.status(400).json({
        success: false,
        message: "Rating, title, and review are required",
      })
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      })
    }

    // Verify the order item exists and belongs to the user
    const orderItem = await OrderItem.findById(orderItemId).populate("orderId")

    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      })
    }

    // Verify the order belongs to the user
    if (orderItem.orderId.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to review this product",
      })
    }

    // Verify the product ID matches
    if (orderItem.productId.toString() !== productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID doesn't match the order item",
      })
    }

    // Check if the order item is delivered
    if (orderItem.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "You can only review products that have been delivered",
      })
    }

    // Check if the user has already reviewed this product for this order item
    const existingReview = await Review.findOne({
      userId,
      productId,
      orderItemId,
    })

    if (existingReview) {
      // Update existing review
      existingReview.rating = rating
      existingReview.title = title
      existingReview.review = review
      existingReview.isApproved = false // Reset approval status for moderation
      existingReview.isRejected = false
      existingReview.rejectionReason = ""
      existingReview.updatedAt = Date.now()

      await existingReview.save()

      return res.status(200).json({
        success: true,
        message: "Your review has been updated and will be visible after moderation",
        review: existingReview,
      })
    } else {
      // Create new review
      const newReview = new Review({
        userId,
        productId,
        orderId: orderItem.orderId._id,
        orderItemId,
        rating,
        title,
        review,
      })

      await newReview.save()

      return res.status(201).json({
        success: true,
        message: "Your review has been submitted and will be visible after moderation",
        review: newReview,
      })
    }
  } catch (error) {
    console.error("Error submitting review:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to submit review",
    })
  }
}

// Get user's reviews
const getUserReviews = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    const totalReviews = await Review.countDocuments({ userId })
    const totalPages = Math.ceil(totalReviews / limit)

    const reviews = await Review.find({ userId })
      .populate("productId", "name images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const user = await User.findById(userId)

    res.render("user-reviews", {
      title: "My Reviews",
      user,
      reviews,
      currentPage: page,
      totalPages,
      totalReviews,
      page: "user-reviews",
    })
  } catch (error) {
    console.error("Error getting user reviews:", error)
    res.redirect("/profile")
  }
}

// Delete user's review
const deleteReview = async (req, res) => {
  try {
    const userId = req.session.user || req.user._id
    const reviewId = req.params.id

    const review = await Review.findOne({
      _id: reviewId,
      userId,
    })

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      })
    }

    await review.remove()

    // Update product ratings
    const product = await Product.findById(review.productId)
    if (product && review.isApproved) {
      const approvedReviews = await Review.find({
        productId: review.productId,
        isApproved: true,
        isRejected: false,
      })

      const totalRating = approvedReviews.reduce((sum, r) => sum + r.rating, 0)
      const averageRating = approvedReviews.length > 0 ? totalRating / approvedReviews.length : 0

      product.ratings.average = Number.parseFloat(averageRating.toFixed(1))
      product.ratings.count = approvedReviews.length

      await product.save()
    }

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting review:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to delete review",
    })
  }
}

// Get product reviews for product page
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 5
    const skip = (page - 1) * limit

    // Get only approved reviews
    const totalReviews = await Review.countDocuments({
      productId,
      isApproved: true,
      isRejected: false,
    })

    const totalPages = Math.ceil(totalReviews / limit)

    const reviews = await Review.find({
      productId,
      isApproved: true,
      isRejected: false,
    })
      .populate("userId", "fullname")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    // Get rating distribution
    const ratingDistribution = await Review.aggregate([
      {
        $match: {
          productId: mongoose.Types.ObjectId(productId),
          isApproved: true,
          isRejected: false,
        },
      },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: -1 },
      },
    ])

    // Format distribution for frontend
    const distribution = Array.from({ length: 5 }, (_, i) => {
      const rating = 5 - i
      const found = ratingDistribution.find((item) => item._id === rating)
      return {
        rating,
        count: found ? found.count : 0,
        percentage: totalReviews > 0 ? ((found ? found.count : 0) / totalReviews) * 100 : 0,
      }
    })

    return res.status(200).json({
      success: true,
      reviews,
      pagination: {
        currentPage: page,
        totalPages,
        totalReviews,
      },
      distribution,
    })
  } catch (error) {
    console.error("Error getting product reviews:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to get product reviews",
    })
  }
}

module.exports = {
  canReviewProduct,
  submitReview,
  getUserReviews,
  deleteReview,
  getProductReviews,
}
