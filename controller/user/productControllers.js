const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Category = require("../../model/categoryScheema");
const Review = require("../../model/ReviewScheema");
const mongoose = require("mongoose");

const productdetails = async (req, res) => {
  try {
    const productId = req.params.id || req.query.id;
    if (!productId) {
      return res.redirect("/");
    }

    const product = await Product.findById(productId)
      .populate("categoryId")
      .lean();

    if (!product) {
      return res.redirect("/page-not-found");
    }

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

    const similarProducts = await Product.find({
      categoryId: product.categoryId._id,
      _id: { $ne: product._id },
      isActive: true,
    })
      .limit(4)
      .lean();

    res.render("userproductDetails", {
      user: req.session.user ? await User.findById(req.session.user) : null,
      product: product,
      quantity: quantity,
      totalOffer: totalOffer,
      category: findCategory,
      similarProducts: similarProducts,
    });
  } catch (error) {
    console.error("Error in productdetails:", error);
    return res.redirect("/page-not-found");
  }
};

const markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to mark reviews as helpful",
      });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    if (review.helpfulVotes && review.helpfulVotes.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You have already marked this review as helpful",
      });
    }

    if (!review.helpfulVotes) {
      review.helpfulVotes = [];
    }

    review.helpfulVotes.push(userId);

    await review.save();

    res.json({
      success: true,
      message: "Review marked as helpful",
      helpfulCount: review.helpfulVotes.length,
    });
  } catch (error) {
    console.error("Error marking review as helpful:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while marking the review as helpful",
    });
  }
};

const reloadReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const userId = req.session.user;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const reviews = await Review.find({
      productId,
      hidden: { $ne: true },
    })
      .populate("userId", "name email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const transformedReviews = reviews.map((review) => ({
      _id: review._id,
      title: review.title || "",
      description: review.description || "",
      rating: review.rating || 0,
      createdAt: review.createdAt,
      images: review.images || [],
      helpfulVotes: review.helpfulVotes || [],
      isVerified: review.isVerified || false,

      userHasMarkedHelpful: userId
        ? (review.helpfulVotes || []).includes(userId)
        : false,
      user: {
        fullname: review.userId?.name || "Anonymous",
        email: review.userId?.email || "",
        profileImage:
          review.userId?.profileImage || "/images/default-avatar.jpg",
      },
    }));

    const totalReviews = await Review.countDocuments({
      productId,
      hidden: { $ne: true },
    });
    const totalPages = Math.ceil(totalReviews / limit);

    let reviewStats = {
      average: 0,
      count: totalReviews,
      distribution: {
        1: { count: 0, percentage: 0 },
        2: { count: 0, percentage: 0 },
        3: { count: 0, percentage: 0 },
        4: { count: 0, percentage: 0 },
        5: { count: 0, percentage: 0 },
      },
    };

    if (totalReviews > 0) {
      const allReviews = await Review.find({
        productId,
        hidden: { $ne: true },
      }).lean();

      const totalRating = allReviews.reduce(
        (sum, review) => sum + review.rating,
        0
      );
      reviewStats.average = totalRating / totalReviews;

      allReviews.forEach((review) => {
        const rating = review.rating;
        if (reviewStats.distribution[rating]) {
          reviewStats.distribution[rating].count++;
        }
      });

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
        totalReviews,
      },
    });
  } catch (error) {
    console.error("Error reloading reviews:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while loading reviews",
    });
  }
};

const checkAuth = (req, res) => {
  res.json({
    authenticated: !!req.session.user,
    userId: req.session.user || null,
  });
};

const updateProductRatings = async (productId) => {
  try {
    const reviews = await Review.find({
      productId,
      hidden: { $ne: true },
    }).lean();

    const totalReviews = reviews.length;

    if (totalReviews > 0) {
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0
      );
      const averageRating = totalRating / totalReviews;

      const distribution = {
        1: { count: 0, percentage: 0 },
        2: { count: 0, percentage: 0 },
        3: { count: 0, percentage: 0 },
        4: { count: 0, percentage: 0 },
        5: { count: 0, percentage: 0 },
      };

      reviews.forEach((review) => {
        distribution[review.rating].count++;
      });

      for (let i = 1; i <= 5; i++) {
        distribution[i].percentage = Math.round(
          (distribution[i].count / totalReviews) * 100
        );
      }

      await Product.findByIdAndUpdate(productId, {
        ratings: {
          average: averageRating,
          count: totalReviews,
          distribution: distribution,
        },
      });

      return {
        average: averageRating,
        count: totalReviews,
        distribution: distribution,
      };
    } else {
      const emptyDistribution = {
        1: { count: 0, percentage: 0 },
        2: { count: 0, percentage: 0 },
        3: { count: 0, percentage: 0 },
        4: { count: 0, percentage: 0 },
        5: { count: 0, percentage: 0 },
      };

      await Product.findByIdAndUpdate(productId, {
        ratings: {
          average: 0,
          count: 0,
          distribution: emptyDistribution,
        },
      });

      return {
        average: 0,
        count: 0,
        distribution: emptyDistribution,
      };
    }
  } catch (error) {
    console.error("Error updating product ratings:", error);
    throw error;
  }
};

const submitReview = async (req, res) => {
  try {
    const { productId, rating, title, description } = req.body;
    const userId = req.session.user;

    x;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to submit a review",
      });
    }

    const existingReview = await Review.findOne({ productId, userId });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    const newReview = new Review({
      productId,
      userId,
      rating: parseInt(rating),
      title,
      description,
      status: "Approved",
      helpfulVotes: [],
      images: [],
    });

    await newReview.save();

    const newRating = await updateProductRatings(productId);

    res.json({
      success: true,
      message: "Review submitted successfully",
      review: newReview,
      newRating,
    });
  } catch (error) {
    console.error("Error submitting review:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while submitting your review",
    });
  }
};

module.exports = {
  productdetails,
  markReviewHelpful,
  reloadReviews,
  checkAuth,
  updateProductRatings,
  submitReview,
};
