const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Category = require("../../model/categoryScheema");
const Review = require("../../model/ReviewScheema");
const mongoose = require("mongoose");

/**
 * Controller function to render product details page with reviews
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const productdetails = async (req, res) => {
  try {
    // Get product ID from params or query
    const productId = req.params.id || req.query.id;
    if (!productId) {
      return res.redirect("/");
    }

    // Fetch product with populated category
    const product = await Product.findById(productId)
      .populate("categoryId")
      .lean();

    if (!product) {
      return res.redirect("/page-not-found");
    }

    // Calculate offers and quantity
    const findCategory = product.categoryId;
    const categoryOffer = findCategory?.offer || 0;
    const productOffer = product.offer || 0;
    const totalOffer = categoryOffer + productOffer;
    const quantity =
      product.variants && product.variants.length > 0
        ? product.variants.reduce(
            (acc, variant) => acc + (variant.varientquatity || 0),
            0
          )
        : 0;

    // Fetch similar products
    const similarProducts = await Product.find({
      categoryId: product.categoryId._id,
      _id: { $ne: product._id },
      isActive: true,
    })
      .limit(4)
      .lean();

    // Initialize review variables
    let reviews = [];
    let reviewsError = false;
    let reviewStats = {
      average: 0,
      count: 0,
      distribution: {
        1: { count: 0, percentage: 0 },
        2: { count: 0, percentage: 0 },
        3: { count: 0, percentage: 0 },
        4: { count: 0, percentage: 0 },
        5: { count: 0, percentage: 0 }
      }
    };

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 5; // Reviews per page
    const skip = (page - 1) * limit;
    let totalPages = 0;

    try {
      // Fetch reviews with pagination
      reviews = await Review.find({ productId })
        .populate("userId", "name profileImage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Count total reviews for pagination
      const totalReviews = await Review.countDocuments({ productId });
      totalPages = Math.ceil(totalReviews / limit);

      // Calculate review statistics if there are reviews
      if (totalReviews > 0) {
        // Get all reviews for statistics (without pagination)
        const allReviews = await Review.find({ productId }).lean();
        
        // Calculate average rating
        const totalRating = allReviews.reduce((sum, review) => sum + review.rating, 0);
        reviewStats.average = totalRating / totalReviews;
        reviewStats.count = totalReviews;

        // Calculate distribution
        allReviews.forEach(review => {
          const rating = review.rating;
          if (reviewStats.distribution[rating]) {
            reviewStats.distribution[rating].count++;
          }
        });

        // Calculate percentages
        for (let i = 1; i <= 5; i++) {
          reviewStats.distribution[i].percentage = Math.round(
            (reviewStats.distribution[i].count / totalReviews) * 100
          );
        }
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
      reviewsError = true;
      // We'll still render the page, but with an error flag for reviews
    }

    // Render the product details page with all data
    res.render("productDetails", {
      user: req.session.user ? await User.findById(req.session.user) : null,
      product: product,
      quantity: quantity,
      totalOffer: totalOffer,
      category: findCategory,
      similarProducts: similarProducts,
      reviews: reviews,
      reviewStats: reviewStats,
      reviewsError: reviewsError,
      currentPage: page,
      totalPages: totalPages
    });
  } catch (error) {
    console.error("Error in productdetails:", error);
    return res.redirect("/page-not-found");
  }
};

/**
 * API endpoint to mark a review as helpful
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.body;
    const userId = req.session.user;

    // Check if user is logged in
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to mark reviews as helpful"
      });
    }

    // Find the review
    const review = await Review.findById(reviewId);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    // Check if user has already marked this review as helpful
    if (review.helpfulVotes && review.helpfulVotes.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You have already marked this review as helpful"
      });
    }

    // Add user to helpful votes and increment helpful count
    if (!review.helpfulVotes) {
      review.helpfulVotes = [];
    }
    
    review.helpfulVotes.push(userId);
    review.helpful = (review.helpful || 0) + 1;
    
    await review.save();

    res.json({
      success: true,
      message: "Review marked as helpful",
      helpfulCount: review.helpful || review.helpfulVotes.length
    });
  } catch (error) {
    console.error("Error marking review as helpful:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while marking the review as helpful"
    });
  }
};

/**
 * API endpoint to reload reviews (for retry functionality)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const reloadReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    // Validate productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    // Fetch reviews with pagination
    const reviews = await Review.find({ productId })
      .populate("userId", "name profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Transform reviews for frontend
    const transformedReviews = reviews.map(review => ({
      _id: review._id,
      title: review.title || '',
      description: review.description || '',
      rating: review.rating || 0,
      createdAt: review.createdAt,
      images: review.images || [],
      helpfulVotes: review.helpfulVotes || [],
      isVerified: review.isVerified || false,
      user: {
        fullname: review.userId?.name || 'Anonymous',
        profileImage: review.userId?.profileImage || '/images/default-avatar.jpg'
      }
    }));

    // Count total reviews for pagination
    const totalReviews = await Review.countDocuments({ productId });
    const totalPages = Math.ceil(totalReviews / limit);

    // Calculate review statistics
    let reviewStats = {
      average: 0,
      count: totalReviews,
      distribution: {
        1: { count: 0, percentage: 0 },
        2: { count: 0, percentage: 0 },
        3: { count: 0, percentage: 0 },
        4: { count: 0, percentage: 0 },
        5: { count: 0, percentage: 0 }
      }
    };

    if (totalReviews > 0) {
      // Get all reviews for statistics (without pagination)
      const allReviews = await Review.find({ productId }).lean();
      
      // Calculate average rating
      const totalRating = allReviews.reduce((sum, review) => sum + review.rating, 0);
      reviewStats.average = totalRating / totalReviews;

      // Calculate distribution
      allReviews.forEach(review => {
        const rating = review.rating;
        if (reviewStats.distribution[rating]) {
          reviewStats.distribution[rating].count++;
        }
      });

      // Calculate percentages
      for (let i = 1; i <= 5; i++) {
        reviewStats.distribution[i].percentage = Math.round(
          (reviewStats.distribution[i].count / totalReviews) * 100
        );
      }
    }

    res.json({
      success: true,
      reviews: transformedReviews,
      reviewStats,
      pagination: {
        currentPage: page,
        totalPages,
        totalReviews
      }
    });
  } catch (error) {
    console.error("Error reloading reviews:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while loading reviews"
    });
  }
};

/**
 * API endpoint to check if user is authenticated
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const checkAuth = (req, res) => {
  res.json({
    authenticated: !!req.session.user
  });
};

/**
 * Helper function to update product ratings
 * @param {String} productId - Product ID
 */
const updateProductRatings = async (productId) => {
  try {
    // Get all reviews for the product
    const reviews = await Review.find({ productId }).lean();
    const totalReviews = reviews.length;

    if (totalReviews > 0) {
      // Calculate average rating
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      const averageRating = totalRating / totalReviews;

      // Calculate distribution
      const distribution = {
        1: { count: 0, percentage: 0 },
        2: { count: 0, percentage: 0 },
        3: { count: 0, percentage: 0 },
        4: { count: 0, percentage: 0 },
        5: { count: 0, percentage: 0 }
      };

      reviews.forEach(review => {
        distribution[review.rating].count++;
      });

      // Calculate percentages
      for (let i = 1; i <= 5; i++) {
        distribution[i].percentage = Math.round(
          (distribution[i].count / totalReviews) * 100
        );
      }

      // Update product ratings
      await Product.findByIdAndUpdate(productId, {
        ratings: {
          average: averageRating,
          count: totalReviews,
          distribution: distribution
        }
      });
    } else {
      // No reviews, reset ratings
      await Product.findByIdAndUpdate(productId, {
        ratings: {
          average: 0,
          count: 0,
          distribution: {
            1: { count: 0, percentage: 0 },
            2: { count: 0, percentage: 0 },
            3: { count: 0, percentage: 0 },
            4: { count: 0, percentage: 0 },
            5: { count: 0, percentage: 0 }
          }
        }
      });
    }
  } catch (error) {
    console.error("Error updating product ratings:", error);
    throw error;
  }
};

module.exports = {
  productdetails,
  markReviewHelpful,
  reloadReviews,
  checkAuth,
  updateProductRatings
};