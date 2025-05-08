const Review = require("../../model/ReviewScheema")
const Product = require("../../model/productScheema")
const mongoose = require("mongoose")
const User = require("../../model/userSchema") // Import the User model

// Get all reviews for admin dashboard
const getAllReviews = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    // Filter options
    const status = req.query.status || "all" // all, pending, approved, rejected
    const sortBy = req.query.sortBy || "createdAt" // createdAt, rating
    const sortOrder = req.query.sortOrder || "desc" // asc, desc

    // Build query based on filters
    const query = {}
    if (status === "pending") {
      query.isApproved = false
      query.isRejected = false
    } else if (status === "approved") {
      query.isApproved = true
    } else if (status === "rejected") {
      query.isRejected = true
    }

    // Search by product name or user name if provided
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i")

      // We need to find products and users that match the search term
      const products = await Product.find({ name: searchRegex }).select("_id")
      const productIds = products.map((product) => product._id)

      // Find users by name
      const users = await User.find({ fullname: searchRegex }).select("_id")
      const userIds = users.map((user) => user._id)

      // Add to query
      query.$or = [{ productId: { $in: productIds } }, { userId: { $in: userIds } }]
    }

    // Count total reviews matching the query
    const totalReviews = await Review.countDocuments(query)
    const totalPages = Math.ceil(totalReviews / limit)

    // Sort options
    const sortOptions = {}
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1

    // Fetch reviews with pagination and sorting
    const reviews = await Review.find(query)
      .populate("userId", "fullname email")
      .populate("productId", "name images")
      .populate("orderId", "orderNumber")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)

    // Get counts for dashboard
    const pendingCount = await Review.countDocuments({ isApproved: false, isRejected: false })
    const approvedCount = await Review.countDocuments({ isApproved: true })
    const rejectedCount = await Review.countDocuments({ isRejected: true })

    res.render("admin/reviews", {
      title: "Review Management",
      reviews,
      pagination: {
        currentPage: page,
        totalPages,
        totalReviews,
      },
      filters: {
        status,
        sortBy,
        sortOrder,
        search: req.query.search || "",
      },
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: totalReviews,
      },
    })
  } catch (error) {
    console.error("Error getting reviews:", error)
    res.status(500).render("admin/error", {
      message: "Failed to load reviews",
      error,
    })
  }
}

// Approve a review
const approveReview = async (req, res) => {
  try {
    const { id } = req.params

    const review = await Review.findById(id)
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      })
    }

    // Update review status
    review.isApproved = true
    review.isRejected = false
    review.rejectionReason = ""
    review.updatedAt = Date.now()

    await review.save()

    return res.status(200).json({
      success: true,
      message: "Review approved successfully",
    })
  } catch (error) {
    console.error("Error approving review:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to approve review",
    })
  }
}

// Reject a review
const rejectReview = async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      })
    }

    const review = await Review.findById(id)
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      })
    }

    // Update review status
    review.isApproved = false
    review.isRejected = true
    review.rejectionReason = reason
    review.updatedAt = Date.now()

    await review.save()

    return res.status(200).json({
      success: true,
      message: "Review rejected successfully",
    })
  } catch (error) {
    console.error("Error rejecting review:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to reject review",
    })
  }
}

// Delete a review
const deleteReview = async (req, res) => {
  try {
    const { id } = req.params

    const review = await Review.findById(id)
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

// Get review statistics for admin dashboard
const getReviewStatistics = async (req, res) => {
  try {
    // Get counts
    const totalReviews = await Review.countDocuments()
    const pendingReviews = await Review.countDocuments({ isApproved: false, isRejected: false })
    const approvedReviews = await Review.countDocuments({ isApproved: true })
    const rejectedReviews = await Review.countDocuments({ isRejected: true })

    // Get average rating
    const averageRating = await Review.aggregate([
      { $match: { isApproved: true } },
      { $group: { _id: null, average: { $avg: "$rating" } } },
    ])

    // Get rating distribution
    const ratingDistribution = await Review.aggregate([
      { $match: { isApproved: true } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ])

    // Get recent reviews
    const recentReviews = await Review.find()
      .populate("userId", "fullname")
      .populate("productId", "name")
      .sort({ createdAt: -1 })
      .limit(5)

    // Get reviews per day for the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const reviewsPerDay = await Review.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    return res.status(200).json({
      success: true,
      statistics: {
        totalReviews,
        pendingReviews,
        approvedReviews,
        rejectedReviews,
        averageRating: averageRating.length > 0 ? Number.parseFloat(averageRating[0].average.toFixed(1)) : 0,
        ratingDistribution,
        recentReviews,
        reviewsPerDay,
      },
    })
  } catch (error) {
    console.error("Error getting review statistics:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to get review statistics",
    })
  }
}

module.exports = {
  getAllReviews,
  approveReview,
  rejectReview,
  deleteReview,
  getReviewStatistics,
}
