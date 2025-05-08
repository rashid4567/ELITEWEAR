const Review = require("../../model/ReviewScheema");
const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const mongoose = require("mongoose");

// Submit a new review or update existing review
const submitReview = async (req, res) => {
    try {
        const { productId, orderItemId, rating, title, review } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to submit a review"
            });
        }

        if (!productId || !rating || !title || !review) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        // Validate rating
        const ratingNum = parseInt(rating);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5"
            });
        }

        // Check if user has purchased and received the product
        const canReview = await checkReviewEligibility(productId, userId);
        
        if (!canReview) {
            return res.status(403).json({
                success: false,
                message: "You can only review products you have purchased and received"
            });
        }

        // Check if user has already reviewed this product
        let existingReview = await Review.findOne({
            product: productId,
            user: userId
        });

        let result;
        
        if (existingReview) {
            // Update existing review
            existingReview.rating = ratingNum;
            existingReview.title = title;
            existingReview.description = review;
            existingReview.updatedAt = Date.now();
            
            result = await existingReview.save();
            
            await updateProductRating(productId);
            
            return res.json({
                success: true,
                message: "Your review has been updated",
                review: result
            });
        } else {
            // Create new review
            const newReview = new Review({
                product: productId,
                user: userId,
                orderItem: orderItemId,
                rating: ratingNum,
                title: title,
                description: review
            });
            
            result = await newReview.save();
            
            // Update product rating
            const newRating = await updateProductRating(productId);
            
            return res.json({
                success: true,
                message: "Your review has been submitted",
                review: result,
                newRating: newRating
            });
        }
    } catch (error) {
        console.error("Error submitting review:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit review. Please try again."
        });
    }
};

// Mark a review as helpful
const markReviewHelpful = async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to mark a review as helpful"
            });
        }

        const review = await Review.findById(reviewId);
        
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if user has already marked this review as helpful
        if (review.helpfulVotes && review.helpfulVotes.includes(userId)) {
            // Remove the vote
            review.helpfulVotes = review.helpfulVotes.filter(
                id => id.toString() !== userId.toString()
            );
            
            await review.save();
            
            return res.json({
                success: true,
                message: "You have removed your helpful vote",
                helpfulCount: review.helpfulVotes.length
            });
        } else {
            // Add the vote
            if (!review.helpfulVotes) {
                review.helpfulVotes = [];
            }
            
            review.helpfulVotes.push(userId);
            await review.save();
            
            return res.json({
                success: true,
                message: "You have marked this review as helpful",
                helpfulCount: review.helpfulVotes.length
            });
        }
    } catch (error) {
        console.error("Error marking review as helpful:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to mark review as helpful. Please try again."
        });
    }
};

// Delete a review
const deleteReview = async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to delete a review"
            });
        }

        const review = await Review.findById(reviewId);
        
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if the user is the author of the review
        if (review.user.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own reviews"
            });
        }

        // Delete the review
        await Review.findByIdAndDelete(reviewId);
        
        // Update product rating
        await updateProductRating(review.product);
        
        return res.json({
            success: true,
            message: "Your review has been deleted"
        });
    } catch (error) {
        console.error("Error deleting review:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete review. Please try again."
        });
    }
};

// Get reviews for a product
const getProductReviews = async (req, res) => {
    try {
        const productId = req.params.productId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;
        
        // Make sure to use 'new' with ObjectId
        const product = new mongoose.Types.ObjectId(productId);
        
        // Get reviews for the product
        const reviews = await Review.find({ product })
            .populate('user', 'fullname profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
            
        // Get total count for pagination
        const totalReviews = await Review.countDocuments({ product });
        
        return res.json({
            success: true,
            reviews,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalReviews / limit),
                totalReviews
            }
        });
    } catch (error) {
        console.error('Error getting product reviews:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to load reviews'
        });
    }
};

// Get reviews by a user
const getUserReviews = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to view your reviews"
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get reviews by the user
        const reviews = await Review.find({ user: userId })
            .populate('product', 'name images')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
            
        // Get total count for pagination
        const totalReviews = await Review.countDocuments({ user: userId });
        
        return res.json({
            success: true,
            reviews,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalReviews / limit),
                totalReviews
            }
        });
    } catch (error) {
        console.error("Error getting user reviews:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load reviews. Please try again."
        });
    }
};

// Helper function to check if user can review a product
const checkReviewEligibility = async (productId, userId) => {
    try {
        // Check if user has purchased and received this product
        const deliveredItems = await OrderItem.find({
            productId: productId,
            status: "Delivered"
        }).populate({
            path: 'orderId',
            select: 'userId'
        });
        
        // Check if any of these items belong to the user
        for (const item of deliveredItems) {
            if (item.orderId && item.orderId.userId.toString() === userId.toString()) {
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error("Error checking review eligibility:", error);
        return false;
    }
};

// Helper function to update product rating
const updateProductRating = async (productId) => {
    try {
        // Get all reviews for the product
        const reviews = await Review.find({ product: productId });
        
        if (reviews.length === 0) {
            // No reviews, reset rating to 0
            await Product.findByIdAndUpdate(productId, {
                'ratings.average': 0,
                'ratings.count': 0,
                'ratings.distribution': {
                    '1': { count: 0 },
                    '2': { count: 0 },
                    '3': { count: 0 },
                    '4': { count: 0 },
                    '5': { count: 0 }
                }
            });
            
            return {
                average: 0,
                count: 0,
                distribution: {
                    '1': { count: 0 },
                    '2': { count: 0 },
                    '3': { count: 0 },
                    '4': { count: 0 },
                    '5': { count: 0 }
                }
            };
        }
        
        // Calculate average rating
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = totalRating / reviews.length;
        
        // Calculate rating distribution
        const distribution = {
            '1': { count: 0 },
            '2': { count: 0 },
            '3': { count: 0 },
            '4': { count: 0 },
            '5': { count: 0 }
        };
        
        reviews.forEach(review => {
            distribution[review.rating].count++;
        });
        
        // Update product with new rating data
        await Product.findByIdAndUpdate(productId, {
            'ratings.average': averageRating,
            'ratings.count': reviews.length,
            'ratings.distribution': distribution
        });
        
        return {
            average: averageRating,
            count: reviews.length,
            distribution: distribution
        };
    } catch (error) {
        console.error("Error updating product rating:", error);
        throw error;
    }
};

// Get review statistics for a product
const getReviewStatistics = async (productId) => {
    try {
        const totalReviews = await Review.countDocuments({ product: productId });
        
        if (totalReviews === 0) {
            return {
                averageRating: 0,
                totalReviews: 0,
                distribution: {
                    5: { count: 0, percentage: 0 },
                    4: { count: 0, percentage: 0 },
                    3: { count: 0, percentage: 0 },
                    2: { count: 0, percentage: 0 },
                    1: { count: 0, percentage: 0 }
                }
            };
        }
        
        // Calculate average rating
        const ratingSum = await Review.aggregate([
            { $match: { product: new mongoose.Types.ObjectId(productId) } },
            { $group: { _id: null, total: { $sum: "$rating" } } }
        ]);
        
        const averageRating = ratingSum.length > 0 
            ? (ratingSum[0].total / totalReviews).toFixed(1) 
            : 0;
        
        // Get rating distribution
        const distribution = await Review.aggregate([
            { $match: { product: new mongoose.Types.ObjectId(productId) } },
            { $group: { _id: "$rating", count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);
        
        // Format distribution for frontend
        const formattedDistribution = {};
        for (let i = 1; i <= 5; i++) {
            const found = distribution.find(item => item._id === i);
            formattedDistribution[i] = {
                count: found ? found.count : 0,
                percentage: totalReviews > 0 
                    ? Math.round(((found ? found.count : 0) / totalReviews) * 100) 
                    : 0
            };
        }
        
        return {
            averageRating,
            totalReviews,
            distribution: formattedDistribution
        };
    } catch (error) {
        console.error("Error getting review statistics:", error);
        return {
            averageRating: 0,
            totalReviews: 0,
            distribution: {}
        };
    }
};

// Get reviews for a specific order item
const getOrderItemReview = async (req, res) => {
    try {
        const { orderItemId } = req.params;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to view reviews"
            });
        }

        // Find the review for this order item
        const review = await Review.findOne({ 
            orderItem: orderItemId,
            user: userId
        }).lean();
        
        if (!review) {
            return res.json({
                success: true,
                hasReview: false
            });
        }
        
        return res.json({
            success: true,
            hasReview: true,
            review
        });
    } catch (error) {
        console.error("Error getting order item review:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load review. Please try again."
        });
    }
};

// Submit review for a specific order item
const submitOrderItemReview = async (req, res) => {
    try {
        const { productId, orderItemId } = req.params;
        const { rating, title, review } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to submit a review"
            });
        }

        if (!rating || !title || !review) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        // Validate rating
        const ratingNum = parseInt(rating);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5"
            });
        }

        // Verify the order item exists and belongs to the user
        const orderItem = await OrderItem.findById(orderItemId).populate('orderId');
        
        if (!orderItem) {
            return res.status(404).json({
                success: false,
                message: "Order item not found"
            });
        }
        
        if (!orderItem.orderId || orderItem.orderId.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only review items from your own orders"
            });
        }
        
        if (orderItem.status !== "Delivered") {
            return res.status(403).json({
                success: false,
                message: "You can only review items that have been delivered"
            });
        }

        // Check if user has already reviewed this order item
        let existingReview = await Review.findOne({
            orderItem: orderItemId
        });

        let result;
        
        if (existingReview) {
            // Update existing review
            existingReview.rating = ratingNum;
            existingReview.title = title;
            existingReview.description = review;
            existingReview.updatedAt = Date.now();
            
            result = await existingReview.save();
            
            await updateProductRating(productId);
            
            return res.json({
                success: true,
                message: "Your review has been updated",
                review: result
            });
        } else {
            // Create new review
            const newReview = new Review({
                product: productId,
                user: userId,
                orderItem: orderItemId,
                rating: ratingNum,
                title: title,
                description: review
            });
            
            result = await newReview.save();
            
            // Update product rating
            const newRating = await updateProductRating(productId);
            
            return res.json({
                success: true,
                message: "Your review has been submitted",
                review: result,
                newRating: newRating
            });
        }
    } catch (error) {
        console.error("Error submitting order item review:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit review. Please try again."
        });
    }
};

module.exports = {
    submitReview,
    markReviewHelpful,
    deleteReview,
    getProductReviews,
    getUserReviews,
    getReviewStatistics,
    checkReviewEligibility,
    getOrderItemReview,
    submitOrderItemReview
};