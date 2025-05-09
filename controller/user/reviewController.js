const mongoose = require('mongoose');
const Review = require('../../model/ReviewScheema');
const Product = require('../../model/productScheema');
const OrderItem = require('../../model/orderItemSchema');
const Order = require('../../model/orderSchema');

// 1. Submit/Update Review Function
const submitOrderItemReview = async (req, res) => {
    try {
        const { productId, orderItemId } = req.params;
        const { rating, title, review, reviewId } = req.body;
        
        // Get user ID from session
        const userId = req.session.user;

        console.log(`[DEBUG] Review submission - productId: ${productId}, orderItemId: ${orderItemId}, userId: ${userId}`);
        console.log(`[DEBUG] Review data - rating: ${rating}, title: ${title?.substring(0, 20)}`);
        console.log(`[DEBUG] Review ID (if updating): ${reviewId || 'New Review'}`);

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
        
        // Safely compare user IDs with toString() and null checks
        const orderUserId = orderItem.orderId && orderItem.orderId.userId ? 
            orderItem.orderId.userId.toString() : null;
        const currentUserId = userId ? userId.toString() : null;
        
        if (!orderUserId || !currentUserId || orderUserId !== currentUserId) {
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

        let result;
        
        // If reviewId is provided, try to update that specific review
        if (reviewId) {
            const existingReview = await Review.findById(reviewId);
            
            if (!existingReview) {
                return res.status(404).json({
                    success: false,
                    message: "Review not found"
                });
            }
            
            // Verify the review belongs to the user
            if (existingReview.userId && existingReview.userId.toString() !== userId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "You can only edit your own reviews"
                });
            }
            
            // Update the review
            existingReview.rating = ratingNum;
            existingReview.title = title;
            existingReview.description = review;
            
            // Make sure productId field is set if it wasn't before
            if (!existingReview.productId && productId) {
                try {
                    existingReview.productId = new mongoose.Types.ObjectId(productId);
                } catch (err) {
                    console.error('[ERROR] Failed to set product ID on review update:', err);
                }
            }
            
            // Make sure orderItem field is set if it wasn't before
            if (!existingReview.orderItem && orderItemId) {
                try {
                    existingReview.orderItem = new mongoose.Types.ObjectId(orderItemId);
                } catch (err) {
                    console.error('[ERROR] Failed to set orderItem ID on review update:', err);
                }
            }
            
            result = await existingReview.save();
            
            await updateProductRating(productId);
            
            return res.json({
                success: true,
                message: "Your review has been updated",
                review: result
            });
        } else {
            // Check if user has already reviewed this order item
            let existingReview = await Review.findOne({
                orderItem: orderItemId
            });
            
            if (existingReview) {
                // Update existing review
                existingReview.rating = ratingNum;
                existingReview.title = title;
                existingReview.description = review;
                
                // Make sure productId field is set if it wasn't before
                if (!existingReview.productId && productId) {
                    try {
                        existingReview.productId = new mongoose.Types.ObjectId(productId);
                    } catch (err) {
                        console.error('[ERROR] Failed to set product ID on review update:', err);
                    }
                }
                
                result = await existingReview.save();
                
                await updateProductRating(productId);
                
                return res.json({
                    success: true,
                    message: "Your review has been updated",
                    review: result
                });
            } else {
                // Create new review
                try {
                    // Safely create ObjectIds with error handling
                    let productObjectId = null;
                    let userObjectId = null;
                    let orderItemObjectId = null;
                    
                    try {
                        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
                            productObjectId = new mongoose.Types.ObjectId(productId);
                        }
                    } catch (err) {
                        console.error('[ERROR] Invalid product ID:', productId, err);
                    }
                    
                    try {
                        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
                            userObjectId = new mongoose.Types.ObjectId(userId);
                        }
                    } catch (err) {
                        console.error('[ERROR] Invalid user ID:', userId, err);
                    }
                    
                    try {
                        if (orderItemId && mongoose.Types.ObjectId.isValid(orderItemId)) {
                            orderItemObjectId = new mongoose.Types.ObjectId(orderItemId);
                        }
                    } catch (err) {
                        console.error('[ERROR] Invalid order item ID:', orderItemId, err);
                    }
                    
                    // Create the review object with all required fields
                    const newReview = new Review({
                        productId: productObjectId,
                        userId: userObjectId,
                        orderItem: orderItemObjectId,
                        orderId: orderItem.orderId._id,
                        rating: ratingNum,
                        title: title,
                        description: review
                    });
                    
                    console.log('[DEBUG] New review object:', {
                        productId: productObjectId,
                        userId: userObjectId,
                        orderItem: orderItemObjectId,
                        orderId: orderItem.orderId._id,
                        rating: ratingNum
                    });
                    
                    // Validate all required fields are present
                    if (!newReview.productId || !newReview.userId || !newReview.orderItem) {
                        console.error('[ERROR] Required fields missing in review:', newReview);
                        
                        // Try to fix missing fields if possible
                        if (!newReview.productId && productId) {
                            console.log('[DEBUG] Attempting to fix missing productId field');
                            newReview.productId = productId;
                        }
                        
                        if (!newReview.userId && userId) {
                            console.log('[DEBUG] Attempting to fix missing userId field');
                            newReview.userId = userId;
                        }
                        
                        if (!newReview.orderItem && orderItemId) {
                            console.log('[DEBUG] Attempting to fix missing orderItem field');
                            newReview.orderItem = orderItemId;
                        }
                        
                        // Check again after fixes
                        if (!newReview.productId || !newReview.userId || !newReview.orderItem) {
                            return res.status(400).json({
                                success: false,
                                message: "Required fields missing in review"
                            });
                        }
                    }
                    
                    result = await newReview.save();
                    
                    // Update product rating
                    const newRating = await updateProductRating(productId);
                    
                    return res.json({
                        success: true,
                        message: "Your review has been submitted",
                        review: result,
                        newRating: newRating
                    });
                } catch (err) {
                    console.error('[ERROR] Error creating new review:', err);
                    return res.status(500).json({
                        success: false,
                        message: "Failed to create review: " + err.message
                    });
                }
            }
        }
    } catch (error) {
        console.error("Error submitting order item review:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit review. Please try again."
        });
    }
};

// 2. Delete Review Function
const deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        
        // Get user ID from session
        const userId = req.session.user;
        
        console.log(`[DEBUG] Delete review - reviewId: ${reviewId}, userId: ${userId}`);
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to delete a review"
            });
        }
        
        if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review ID"
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
        
        // Safely compare user IDs with toString() and null checks
        const reviewUserId = review.userId ? review.userId.toString() : null;
        const currentUserId = userId ? userId.toString() : null;
        
        console.log(`[DEBUG] Review user ID: ${reviewUserId}, Current user ID: ${currentUserId}`);
        
        if (!reviewUserId || !currentUserId || reviewUserId !== currentUserId) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own reviews"
            });
        }
        
        // Get product ID for rating update
        const productId = review.productId ? review.productId.toString() : null;
        
        // Delete the review
        await Review.findByIdAndDelete(reviewId);
        
        // Update product rating if we have a product ID
        if (productId) {
            await updateProductRating(productId);
        }
        
        return res.json({
            success: true,
            message: "Review deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting review:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete review. Please try again."
        });
    }
};

// 3. Get Product Reviews Function
const getProductReviews = async (req, res) => {
    try {
        const productId = req.params.productId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;
        
        // Validate product ID
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }
        
        // Make sure to use 'new' with ObjectId
        const productObjId = new mongoose.Types.ObjectId(productId);
        
        // Use the correct field name from your schema
        const reviews = await Review.find({ productId: productObjId })
            .populate('userId', 'fullname')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
            
        // Get total count for pagination
        const totalReviews = await Review.countDocuments({ productId: productObjId });
        
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

// 4. Helper function to update product rating
const updateProductRating = async (productId) => {
    try {
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            console.error('[ERROR] Invalid product ID for rating update:', productId);
            return null;
        }
        
        const productObjId = new mongoose.Types.ObjectId(productId);
        
        // Calculate average rating
        const result = await Review.aggregate([
            { $match: { productId: productObjId } },
            { $group: { _id: null, averageRating: { $avg: "$rating" }, count: { $sum: 1 } } }
        ]);
        
        let averageRating = 0;
        let reviewCount = 0;
        
        if (result.length > 0) {
            averageRating = result[0].averageRating;
            reviewCount = result[0].count;
        }
        
        // Update product with new rating - using the ratings object structure from your schema
        await Product.findByIdAndUpdate(productId, {
            'ratings.average': averageRating,
            'ratings.count': reviewCount
        });
        
        return { rating: averageRating, count: reviewCount };
    } catch (error) {
        console.error('Error updating product rating:', error);
        return null;
    }
};

// 5. Get User Reviews Function
const getUserReviews = async (req, res) => {
    try {
        // Get user ID from session
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
        
        // Find all reviews by the user
        const reviews = await Review.find({ userId: userId })
            .populate('productId', 'name images')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
            
        // Get total count for pagination
        const totalReviews = await Review.countDocuments({ userId: userId });
        
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
        console.error('Error getting user reviews:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to load your reviews'
        });
    }
};

// 6. Mark a review as helpful
const markReviewHelpful = async (req, res) => {
    try {
        const { reviewId } = req.params;
        
        // Get user ID from session
        const userId = req.session.user;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to mark a review as helpful"
            });
        }
        
        if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review ID"
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
        const userIdObj = new mongoose.Types.ObjectId(userId);
        const alreadyMarked = review.helpfulBy.some(id => id.equals(userIdObj));
        
        if (alreadyMarked) {
            // User already marked this review as helpful, so remove their mark
            review.helpfulBy = review.helpfulBy.filter(id => !id.equals(userIdObj));
            review.helpful = review.helpfulBy.length;
            
            await review.save();
            
            return res.json({
                success: true,
                message: "Removed helpful mark from review",
                helpful: review.helpful,
                isHelpful: false
            });
        } else {
            // User has not marked this review as helpful yet, so add their mark
            review.helpfulBy.push(userIdObj);
            review.helpful = review.helpfulBy.length;
            
            await review.save();
            
            return res.json({
                success: true,
                message: "Marked review as helpful",
                helpful: review.helpful,
                isHelpful: true
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

// 7. Check if user can review a product
const checkReviewEligibility = async (req, res) => {
    try {
        const { productId } = req.params;
        
        // Get user ID from session
        const userId = req.session.user;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to check review eligibility"
            });
        }
        
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }
        
        // Find delivered order items for this product and user
        const orderItems = await OrderItem.find({
            productId: productId,
            status: "Delivered"
        }).populate({
            path: 'orderId',
            match: { userId: userId }
        });
        
        // Filter out items where orderId is null (meaning it doesn't belong to this user)
        const userOrderItems = orderItems.filter(item => item.orderId);
        
        if (userOrderItems.length === 0) {
            return res.json({
                success: true,
                canReview: false,
                message: "You need to purchase and receive this product before reviewing it"
            });
        }
        
        // Check if user has already reviewed this product
        const existingReview = await Review.findOne({
            productId: productId,
            userId: userId
        });
        
        return res.json({
            success: true,
            canReview: !existingReview,
            hasReviewed: !!existingReview,
            reviewId: existingReview ? existingReview._id : null,
            orderItems: userOrderItems.map(item => ({
                id: item._id,
                orderId: item.orderId._id,
                orderNumber: item.orderId.orderNumber
            }))
        });
    } catch (error) {
        console.error("Error checking review eligibility:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to check review eligibility. Please try again."
        });
    }
};

// 8. Get review statistics for a product
const getReviewStatistics = async (req, res) => {
    try {
        const { productId } = req.params;
        
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }
        
        const productObjId = new mongoose.Types.ObjectId(productId);
        
        // Get rating distribution
        const ratingDistribution = await Review.aggregate([
            { $match: { productId: productObjId } },
            { $group: { _id: "$rating", count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);
        
        // Get total reviews and average rating
        const stats = await Review.aggregate([
            { $match: { productId: productObjId } },
            { 
                $group: { 
                    _id: null, 
                    totalReviews: { $sum: 1 },
                    averageRating: { $avg: "$rating" },
                    totalHelpful: { $sum: "$helpful" }
                } 
            }
        ]);
        
        // Format the distribution for easier frontend use
        const distribution = {};
        let totalReviews = 0;
        
        if (stats.length > 0) {
            totalReviews = stats[0].totalReviews;
        }
        
        // Initialize all ratings with 0 count
        for (let i = 5; i >= 1; i--) {
            distribution[i] = { count: 0, percentage: 0 };
        }
        
        // Fill in actual counts
        ratingDistribution.forEach(item => {
            distribution[item._id] = {
                count: item.count,
                percentage: totalReviews > 0 ? (item.count / totalReviews) * 100 : 0
            };
        });
        
        return res.json({
            success: true,
            statistics: {
                totalReviews: totalReviews,
                averageRating: stats.length > 0 ? stats[0].averageRating : 0,
                totalHelpful: stats.length > 0 ? stats[0].totalHelpful : 0,
                distribution: distribution
            }
        });
    } catch (error) {
        console.error("Error getting review statistics:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get review statistics. Please try again."
        });
    }
};

// 9. Get a specific review for an order item
const getOrderItemReview = async (req, res) => {
    try {
        const { orderItemId } = req.params;
        
        // Get user ID from session
        const userId = req.session.user;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to view this review"
            });
        }
        
        if (!orderItemId || !mongoose.Types.ObjectId.isValid(orderItemId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order item ID"
            });
        }
        
        // Find the review for this order item
        const review = await Review.findOne({ orderItem: orderItemId })
            .populate('productId', 'name images')
            .lean();
        
        if (!review) {
            return res.json({
                success: true,
                hasReview: false,
                message: "No review found for this order item"
            });
        }
        
        // Check if the review belongs to the current user
        if (review.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only view your own reviews"
            });
        }
        
        return res.json({
            success: true,
            hasReview: true,
            review: review
        });
    } catch (error) {
        console.error("Error getting order item review:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get review. Please try again."
        });
    }
};

// 10. Submit a general review (not tied to a specific order item)
const submitReview = async (req, res) => {
    try {
        const { productId, rating, title, review } = req.body;
        
        // Get user ID from session
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
        
        // Validate product ID
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
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
        
        // Check if user has purchased the product
        const orderItems = await OrderItem.find({
            productId: productId,
            status: "Delivered"
        }).populate({
            path: 'orderId',
            match: { userId: userId }
        });
        
        // Filter out items where orderId is null (meaning it doesn't belong to this user)
        const userOrderItems = orderItems.filter(item => item.orderId);
        
        if (userOrderItems.length === 0) {
            return res.status(403).json({
                success: false,
                message: "You can only review products you have purchased and received"
            });
        }
        
        // Check if user has already reviewed this product
        const existingReview = await Review.findOne({
            productId: productId,
            userId: userId
        });
        
        if (existingReview) {
            // Update existing review
            existingReview.rating = ratingNum;
            existingReview.title = title;
            existingReview.description = review;
            
            const result = await existingReview.save();
            
            // Update product rating
            await updateProductRating(productId);
            
            return res.json({
                success: true,
                message: "Your review has been updated",
                review: result
            });
        } else {
            // Create new review
            const orderItem = userOrderItems[0]; // Use the first delivered order item
            
            const newReview = new Review({
                productId: productId,
                userId: userId,
                orderItem: orderItem._id,
                orderId: orderItem.orderId._id,
                rating: ratingNum,
                title: title,
                description: review
            });
            
            const result = await newReview.save();
            
            // Update product rating
            await updateProductRating(productId);
            
            return res.json({
                success: true,
                message: "Your review has been submitted",
                review: result
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

// Export all functions
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
    submitReview
};