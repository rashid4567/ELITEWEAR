const mongoose = require("mongoose");
const Review = require("../../model/ReviewScheema");
const Product = require("../../model/productScheema");
const OrderItem = require("../../model/orderItemSchema");
const Order = require("../../model/orderSchema");

const submitOrderItemReview = async (req, res) => {
  try {
    const { productId, orderItemId } = req.params;
    const { rating, title, review, reviewId } = req.body;

    const userId = req.session.user;

    console.log(
      `[DEBUG] Review submission - productId: ${productId}, orderItemId: ${orderItemId}, userId: ${userId}`
    );
    console.log(
      `[DEBUG] Review data - rating: ${rating}, title: ${title?.substring(
        0,
        20
      )}`
    );
    console.log(`[DEBUG] Review ID (if updating): ${reviewId || "New Review"}`);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to submit a review",
      });
    }

    if (!rating || !title || !review) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const orderItem = await OrderItem.findById(orderItemId).populate("orderId");

    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      });
    }

    const orderUserId =
      orderItem.orderId && orderItem.orderId.userId
        ? orderItem.orderId.userId.toString()
        : null;
    const currentUserId = userId ? userId.toString() : null;

    if (!orderUserId || !currentUserId || orderUserId !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: "You can only review items from your own orders",
      });
    }

    if (orderItem.status !== "Delivered") {
      return res.status(403).json({
        success: false,
        message: "You can only review items that have been delivered",
      });
    }

    let result;

    if (reviewId) {
      const existingReview = await Review.findById(reviewId);

      if (!existingReview) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      if (
        existingReview.userId &&
        existingReview.userId.toString() !== userId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only edit your own reviews",
        });
      }

      existingReview.rating = ratingNum;
      existingReview.title = title;
      existingReview.description = review;

      if (!existingReview.productId && productId) {
        try {
          existingReview.productId = new mongoose.Types.ObjectId(productId);
        } catch (err) {
          console.error(
            "[ERROR] Failed to set product ID on review update:",
            err
          );
        }
      }

      if (!existingReview.orderItem && orderItemId) {
        try {
          existingReview.orderItem = new mongoose.Types.ObjectId(orderItemId);
        } catch (err) {
          console.error(
            "[ERROR] Failed to set orderItem ID on review update:",
            err
          );
        }
      }

      result = await existingReview.save();

      await updateProductRating(productId);

      return res.json({
        success: true,
        message: "Your review has been updated",
        review: result,
      });
    } else {
      let existingReview = await Review.findOne({
        orderItem: orderItemId,
      });

      if (existingReview) {
        existingReview.rating = ratingNum;
        existingReview.title = title;
        existingReview.description = review;

        if (!existingReview.productId && productId) {
          try {
            existingReview.productId = new mongoose.Types.ObjectId(productId);
          } catch (err) {
            console.error(
              "[ERROR] Failed to set product ID on review update:",
              err
            );
          }
        }

        result = await existingReview.save();

        await updateProductRating(productId);

        return res.json({
          success: true,
          message: "Your review has been updated",
          review: result,
        });
      } else {
        try {
          let productObjectId = null;
          let userObjectId = null;
          let orderItemObjectId = null;

          try {
            if (productId && mongoose.Types.ObjectId.isValid(productId)) {
              productObjectId = new mongoose.Types.ObjectId(productId);
            }
          } catch (err) {
            console.error("[ERROR] Invalid product ID:", productId, err);
          }

          try {
            if (userId && mongoose.Types.ObjectId.isValid(userId)) {
              userObjectId = new mongoose.Types.ObjectId(userId);
            }
          } catch (err) {
            console.error("[ERROR] Invalid user ID:", userId, err);
          }

          try {
            if (orderItemId && mongoose.Types.ObjectId.isValid(orderItemId)) {
              orderItemObjectId = new mongoose.Types.ObjectId(orderItemId);
            }
          } catch (err) {
            console.error("[ERROR] Invalid order item ID:", orderItemId, err);
          }

          const newReview = new Review({
            productId: productObjectId,
            userId: userObjectId,
            orderItem: orderItemObjectId,
            orderId: orderItem.orderId._id,
            rating: ratingNum,
            title: title,
            description: review,
          });

          console.log("[DEBUG] New review object:", {
            productId: productObjectId,
            userId: userObjectId,
            orderItem: orderItemObjectId,
            orderId: orderItem.orderId._id,
            rating: ratingNum,
          });

          // Validate all required fields are present
          if (
            !newReview.productId ||
            !newReview.userId ||
            !newReview.orderItem
          ) {
            console.error(
              "[ERROR] Required fields missing in review:",
              newReview
            );

            // Try to fix missing fields if possible
            if (!newReview.productId && productId) {
              console.log("[DEBUG] Attempting to fix missing productId field");
              newReview.productId = productId;
            }

            if (!newReview.userId && userId) {
              console.log("[DEBUG] Attempting to fix missing userId field");
              newReview.userId = userId;
            }

            if (!newReview.orderItem && orderItemId) {
              console.log("[DEBUG] Attempting to fix missing orderItem field");
              newReview.orderItem = orderItemId;
            }

            if (
              !newReview.productId ||
              !newReview.userId ||
              !newReview.orderItem
            ) {
              return res.status(400).json({
                success: false,
                message: "Required fields missing in review",
              });
            }
          }

          result = await newReview.save();

          const newRating = await updateProductRating(productId);

          return res.json({
            success: true,
            message: "Your review has been submitted",
            review: result,
            newRating: newRating,
          });
        } catch (err) {
          console.error("[ERROR] Error creating new review:", err);
          return res.status(500).json({
            success: false,
            message: "Failed to create review: " + err.message,
          });
        }
      }
    }
  } catch (error) {
    console.error("Error submitting order item review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit review. Please try again.",
    });
  }
};

const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const userId = req.session.user;

    console.log(
      `[DEBUG] Delete review - reviewId: ${reviewId}, userId: ${userId}`
    );

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to delete a review",
      });
    }

    if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const reviewUserId = review.userId ? review.userId.toString() : null;
    const currentUserId = userId ? userId.toString() : null;

    console.log(
      `[DEBUG] Review user ID: ${reviewUserId}, Current user ID: ${currentUserId}`
    );

    if (!reviewUserId || !currentUserId || reviewUserId !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own reviews",
      });
    }

    const productId = review.productId ? review.productId.toString() : null;

    await Review.findByIdAndDelete(reviewId);

    if (productId) {
      await updateProductRating(productId);
    }

    return res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete review. Please try again.",
    });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const productId = req.params.productId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const productObjId = new mongoose.Types.ObjectId(productId);

    const reviews = await Review.find({ productId: productObjId })
      .populate("userId", "fullname")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalReviews = await Review.countDocuments({
      productId: productObjId,
    });

    return res.json({
      success: true,
      reviews,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
      },
    });
  } catch (error) {
    console.error("Error getting product reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load reviews",
    });
  }
};

const updateProductRating = async (productId) => {
  try {
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      console.error("[ERROR] Invalid product ID for rating update:", productId);
      return null;
    }

    const productObjId = new mongoose.Types.ObjectId(productId);

    const result = await Review.aggregate([
      { $match: { productId: productObjId } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    let averageRating = 0;
    let reviewCount = 0;

    if (result.length > 0) {
      averageRating = result[0].averageRating;
      reviewCount = result[0].count;
    }

    await Product.findByIdAndUpdate(productId, {
      "ratings.average": averageRating,
      "ratings.count": reviewCount,
    });

    return { rating: averageRating, count: reviewCount };
  } catch (error) {
    console.error("Error updating product rating:", error);
    return null;
  }
};

const getUserReviews = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to view your reviews",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ userId: userId })
      .populate("productId", "name images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalReviews = await Review.countDocuments({ userId: userId });

    return res.json({
      success: true,
      reviews,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
      },
    });
  } catch (error) {
    console.error("Error getting user reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load your reviews",
    });
  }
};

const markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to mark a review as helpful",
      });
    }

    if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const userIdObj = new mongoose.Types.ObjectId(userId);
    const alreadyMarked = review.helpfulBy.some((id) => id.equals(userIdObj));

    if (alreadyMarked) {
      review.helpfulBy = review.helpfulBy.filter((id) => !id.equals(userIdObj));
      review.helpful = review.helpfulBy.length;

      await review.save();

      return res.json({
        success: true,
        message: "Removed helpful mark from review",
        helpful: review.helpful,
        isHelpful: false,
      });
    } else {
      review.helpfulBy.push(userIdObj);
      review.helpful = review.helpfulBy.length;

      await review.save();

      return res.json({
        success: true,
        message: "Marked review as helpful",
        helpful: review.helpful,
        isHelpful: true,
      });
    }
  } catch (error) {
    console.error("Error marking review as helpful:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark review as helpful. Please try again.",
    });
  }
};

const checkReviewEligibility = async (req, res) => {
  try {
    const { productId } = req.params;

    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to check review eligibility",
      });
    }

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const orderItems = await OrderItem.find({
      productId: productId,
      status: "Delivered",
    }).populate({
      path: "orderId",
      match: { userId: userId },
    });

    const userOrderItems = orderItems.filter((item) => item.orderId);

    if (userOrderItems.length === 0) {
      return res.json({
        success: true,
        canReview: false,
        message:
          "You need to purchase and receive this product before reviewing it",
      });
    }

    const existingReview = await Review.findOne({
      productId: productId,
      userId: userId,
    });

    return res.json({
      success: true,
      canReview: !existingReview,
      hasReviewed: !!existingReview,
      reviewId: existingReview ? existingReview._id : null,
      orderItems: userOrderItems.map((item) => ({
        id: item._id,
        orderId: item.orderId._id,
        orderNumber: item.orderId.orderNumber,
      })),
    });
  } catch (error) {
    console.error("Error checking review eligibility:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check review eligibility. Please try again.",
    });
  }
};

const getReviewStatistics = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const productObjId = new mongoose.Types.ObjectId(productId);

    const ratingDistribution = await Review.aggregate([
      { $match: { productId: productObjId } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);

    const stats = await Review.aggregate([
      { $match: { productId: productObjId } },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$rating" },
          totalHelpful: { $sum: "$helpful" },
        },
      },
    ]);

    const distribution = {};
    let totalReviews = 0;

    if (stats.length > 0) {
      totalReviews = stats[0].totalReviews;
    }

    for (let i = 5; i >= 1; i--) {
      distribution[i] = { count: 0, percentage: 0 };
    }

    ratingDistribution.forEach((item) => {
      distribution[item._id] = {
        count: item.count,
        percentage: totalReviews > 0 ? (item.count / totalReviews) * 100 : 0,
      };
    });

    return res.json({
      success: true,
      statistics: {
        totalReviews: totalReviews,
        averageRating: stats.length > 0 ? stats[0].averageRating : 0,
        totalHelpful: stats.length > 0 ? stats[0].totalHelpful : 0,
        distribution: distribution,
      },
    });
  } catch (error) {
    console.error("Error getting review statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get review statistics. Please try again.",
    });
  }
};

const getOrderItemReview = async (req, res) => {
  try {
    const { orderItemId } = req.params;

    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to view this review",
      });
    }

    if (!orderItemId || !mongoose.Types.ObjectId.isValid(orderItemId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order item ID",
      });
    }

    const review = await Review.findOne({ orderItem: orderItemId })
      .populate("productId", "name images")
      .lean();

    if (!review) {
      return res.json({
        success: true,
        hasReview: false,
        message: "No review found for this order item",
      });
    }

    if (review.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own reviews",
      });
    }

    return res.json({
      success: true,
      hasReview: true,
      review: review,
    });
  } catch (error) {
    console.error("Error getting order item review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get review. Please try again.",
    });
  }
};

const submitReview = async (req, res) => {
  try {
    const { productId, rating, title, review } = req.body;

    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to submit a review",
      });
    }

    if (!productId || !rating || !title || !review) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const orderItems = await OrderItem.find({
      productId: productId,
      status: "Delivered",
    }).populate({
      path: "orderId",
      match: { userId: userId },
    });

    const userOrderItems = orderItems.filter((item) => item.orderId);

    if (userOrderItems.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You can only review products you have purchased and received",
      });
    }

    const existingReview = await Review.findOne({
      productId: productId,
      userId: userId,
    });

    if (existingReview) {
      existingReview.rating = ratingNum;
      existingReview.title = title;
      existingReview.description = review;

      const result = await existingReview.save();

      await updateProductRating(productId);

      return res.json({
        success: true,
        message: "Your review has been updated",
        review: result,
      });
    } else {
      const orderItem = userOrderItems[0];

      const newReview = new Review({
        productId: productId,
        userId: userId,
        orderItem: orderItem._id,
        orderId: orderItem.orderId._id,
        rating: ratingNum,
        title: title,
        description: review,
      });

      const result = await newReview.save();

      await updateProductRating(productId);

      return res.json({
        success: true,
        message: "Your review has been submitted",
        review: result,
      });
    }
  } catch (error) {
    console.error("Error submitting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit review. Please try again.",
    });
  }
};

module.exports = {
  submitOrderItemReview,
  deleteReview,
  getProductReviews,
  getUserReviews,
  updateProductRating,
  markReviewHelpful,
  checkReviewEligibility,
  getReviewStatistics,
  getOrderItemReview,
  submitReview,
};
