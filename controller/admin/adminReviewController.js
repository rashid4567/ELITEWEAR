const Review = require("../../model/ReviewScheema");
const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const mongoose = require("mongoose");


const getAllReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const status = req.query.status || "all";
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder || "desc";
    const search = req.query.search || "";

  
    const query = {};
    if (status === "pending") {
      query.status = "Pending";
      query.hidden = false;
    } else if (status === "approved") {
      query.status = "Approved";
      query.hidden = false;
    } else if (status === "rejected") {
      query.status = "Rejected";
      query.hidden = false;
    } else if (status === "hidden") {
      query.hidden = true;
    }

   
    if (search) {
      const searchRegex = new RegExp(search, "i");


      const products = await Product.find({ name: searchRegex }).select("_id");
      const productIds = products.map((product) => product._id);


      const users = await User.find({ fullname: searchRegex }).select("_id");
      const userIds = users.map((user) => user._id);


      query.$or = [
        { productId: { $in: productIds } },
        { userId: { $in: userIds } },
        { title: { $regex: searchRegex } },
        { description: { $regex: searchRegex } }
      ];
    }


    const totalReviews = await Review.countDocuments(query);
    const totalPages = Math.ceil(totalReviews / limit);

 
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;


    const reviews = await Review.find(query)
      .populate("userId", "fullname email mobile")
      .populate({
        path: "productId",
        select: "name images variants",
        populate: {
          path: "categoryId",
          select: "name"
        }
      })
      .populate("orderId", "orderNumber orderDate")
      .populate("orderItem", "quantity price size")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);


    const pendingCount = await Review.countDocuments({ status: "Pending", hidden: false });
    const approvedCount = await Review.countDocuments({ status: "Approved", hidden: false });
    const rejectedCount = await Review.countDocuments({ status: "Rejected", hidden: false });
    const hiddenCount = await Review.countDocuments({ hidden: true });
    const totalCount = await Review.countDocuments();

   
    const ratingStats = await Review.aggregate([
      { $match: { status: "Approved", hidden: false } },
      { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);

    const avgRating = ratingStats.length > 0 ? ratingStats[0].avgRating.toFixed(1) : 0;


    const ratingDistribution = await Review.aggregate([
      { $match: { status: "Approved", hidden: false } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);


    const formattedDistribution = [0, 0, 0, 0, 0]; 
    ratingDistribution.forEach(item => {
      formattedDistribution[item._id - 1] = item.count;
    });

    res.render("reviewManagement", {
      title: "Review Management",
      reviews,
      pagination: {
        currentPage: page,
        totalPages,
        totalReviews,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      },
      filters: {
        status,
        sortBy,
        sortOrder,
        search
      },
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        hidden: hiddenCount,
        total: totalCount
      },
      stats: {
        avgRating,
        ratingDistribution: formattedDistribution
      }
    });
  } catch (error) {
    console.error("Error getting reviews:", error);
    res.status(500).render("admin/error", {
      message: "Failed to load reviews",
      error
    });
  }
};

const getReviewById = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id)
      .populate("userId", "fullname email mobile")
      .populate({
        path: "productId",
        select: "name images variants",
        populate: {
          path: "categoryId",
          select: "name"
        }
      })
      .populate("orderId", "orderNumber orderDate")
      .populate("orderItem", "quantity price size");

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    return res.status(200).json({
      success: true,
      review
    });
  } catch (error) {
    console.error("Error getting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get review details"
    });
  }
};


const approveReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

   
    review.status = "Approved";
    review.hidden = false;
    review.rejectionReason = "";
    review.isVerified = true;

    await review.save();


    await updateProductRatings(review.productId);

    return res.status(200).json({
      success: true,
      message: "Review approved successfully"
    });
  } catch (error) {
    console.error("Error approving review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve review"
    });
  }
};


const rejectReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required"
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

   
    review.status = "Rejected";
    review.rejectionReason = reason;
    review.isVerified = false;

    await review.save();


    if (review.status === "Approved") {
      await updateProductRatings(review.productId);
    }

    return res.status(200).json({
      success: true,
      message: "Review rejected successfully"
    });
  } catch (error) {
    console.error("Error rejecting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject review"
    });
  }
};

const hideReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }


    review.hidden = true;

    await review.save();


    if (review.status === "Approved") {
      await updateProductRatings(review.productId);
    }

    return res.status(200).json({
      success: true,
      message: "Review hidden successfully"
    });
  } catch (error) {
    console.error("Error hiding review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to hide review"
    });
  }
};


const showReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

   
    review.hidden = false;

    await review.save();

 
    if (review.status === "Approved") {
      await updateProductRatings(review.productId);
    }

    return res.status(200).json({
      success: true,
      message: "Review is now visible"
    });
  } catch (error) {
    console.error("Error showing review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to show review"
    });
  }
};


const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    const productId = review.productId;
    await Review.findByIdAndDelete(id);


    if (review.status === "Approved" && !review.hidden) {
      await updateProductRatings(productId);
    }

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete review"
    });
  }
};


async function updateProductRatings(productId) {
  try {
    const product = await Product.findById(productId);
    if (!product) return;


    const approvedReviews = await Review.find({
      productId: productId,
      status: "Approved",
      hidden: false
    });

    const totalRating = approvedReviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = approvedReviews.length > 0 ? totalRating / approvedReviews.length : 0;

    product.ratings = {
      average: parseFloat(averageRating.toFixed(1)),
      count: approvedReviews.length
    };

    await product.save();
  } catch (error) {
    console.error("Error updating product ratings:", error);
  }
}


const getReviewStatistics = async (req, res) => {
  try {

    const totalReviews = await Review.countDocuments();
    const pendingReviews = await Review.countDocuments({ status: "Pending", hidden: false });
    const approvedReviews = await Review.countDocuments({ status: "Approved", hidden: false });
    const rejectedReviews = await Review.countDocuments({ status: "Rejected", hidden: false });
    const hiddenReviews = await Review.countDocuments({ hidden: true });


    const averageRating = await Review.aggregate([
      { $match: { status: "Approved", hidden: false } },
      { $group: { _id: null, average: { $avg: "$rating" } } }
    ]);


    const ratingDistribution = await Review.aggregate([
      { $match: { status: "Approved", hidden: false } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);


    const recentReviews = await Review.find({ hidden: false })
      .populate("userId", "fullname")
      .populate("productId", "name")
      .sort({ createdAt: -1 })
      .limit(5);

  
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const reviewsPerDay = await Review.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

 
    const mostReviewedProducts = await Review.aggregate([
      { $match: { status: "Approved", hidden: false } },
      { $group: { _id: "$productId", count: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

  
    const productIds = mostReviewedProducts.map(item => item._id);
    const products = await Product.find({ _id: { $in: productIds } }).select("name images");

 
    const productsWithDetails = mostReviewedProducts.map(item => {
      const product = products.find(p => p._id.toString() === item._id.toString());
      return {
        _id: item._id,
        name: product ? product.name : "Unknown Product",
        image: product && product.images.length > 0 ? product.images[0].url : null,
        count: item.count,
        avgRating: parseFloat(item.avgRating.toFixed(1))
      };
    });

    return res.status(200).json({
      success: true,
      statistics: {
        totalReviews,
        pendingReviews,
        approvedReviews,
        rejectedReviews,
        hiddenReviews,
        averageRating: averageRating.length > 0 ? parseFloat(averageRating[0].average.toFixed(1)) : 0,
        ratingDistribution,
        recentReviews,
        reviewsPerDay,
        mostReviewedProducts: productsWithDetails
      }
    });
  } catch (error) {
    console.error("Error getting review statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get review statistics"
    });
  }
};


const exportReviewsCSV = async (req, res) => {
  try {
    const { status, search } = req.query;
    
   
    const query = {};
    if (status === "pending") {
      query.status = "Pending";
      query.hidden = false;
    } else if (status === "approved") {
      query.status = "Approved";
      query.hidden = false;
    } else if (status === "rejected") {
      query.status = "Rejected";
      query.hidden = false;
    } else if (status === "hidden") {
      query.hidden = true;
    }
    

    if (search) {
      const searchRegex = new RegExp(search, "i");
      
   
      const products = await Product.find({ name: searchRegex }).select("_id");
      const productIds = products.map((product) => product._id);
      
     
      const users = await User.find({ fullname: searchRegex }).select("_id");
      const userIds = users.map((user) => user._id);
      
 
      query.$or = [
        { productId: { $in: productIds } },
        { userId: { $in: userIds } },
        { title: { $regex: searchRegex } },
        { description: { $regex: searchRegex } }
      ];
    }
    

    const reviews = await Review.find(query)
      .populate("userId", "fullname email")
      .populate("productId", "name")
      .populate("orderId", "orderNumber")
      .sort({ createdAt: -1 });
    

    let csvContent = "Product,Customer,Email,Rating,Title,Review,Date,Status\n";
    
    reviews.forEach(review => {
      const productName = review.productId?.name || 'Unknown Product';
      const customerName = review.userId?.fullname || 'Unknown User';
      const customerEmail = review.userId?.email || 'N/A';
      const rating = review.rating;

      const title = review.title ? `"${review.title.replace(/"/g, '""')}"` : '';
      const reviewText = review.description ? `"${review.description.replace(/"/g, '""')}"` : '';
      const date = new Date(review.createdAt).toLocaleDateString();
      
      let status = review.status;
      if (review.hidden) {
        status = 'Hidden';
      }
      
      csvContent += `${productName},${customerName},${customerEmail},${rating},${title},${reviewText},${date},${status}\n`;
    });
    
 
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=reviews-${new Date().toISOString().slice(0,10)}.csv`);
    
    // Send CSV content
    res.send(csvContent);
  } catch (error) {
    console.error("Error exporting reviews:", error);
    res.status(500).send("Failed to export reviews");
  }
};


const exportReviewsExcel = async (req, res) => {
  try {
    const { status, search } = req.query;
    

    const query = {};
    if (status === "pending") {
      query.status = "Pending";
      query.hidden = false;
    } else if (status === "approved") {
      query.status = "Approved";
      query.hidden = false;
    } else if (status === "rejected") {
      query.status = "Rejected";
      query.hidden = false;
    } else if (status === "hidden") {
      query.hidden = true;
    }
    
 
    if (search) {
      const searchRegex = new RegExp(search, "i");
      
    
      const products = await Product.find({ name: searchRegex }).select("_id");
      const productIds = products.map((product) => product._id);
      
     
      const users = await User.find({ fullname: searchRegex }).select("_id");
      const userIds = users.map((user) => user._id);
      
     
      query.$or = [
        { productId: { $in: productIds } },
        { userId: { $in: userIds } },
        { title: { $regex: searchRegex } },
        { description: { $regex: searchRegex } }
      ];
    }
    
  
    const reviews = await Review.find(query)
      .populate("userId", "fullname email")
      .populate("productId", "name")
      .populate("orderId", "orderNumber")
      .sort({ createdAt: -1 });
    

    const excel = require('exceljs');
    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet('Reviews');
    
    
    worksheet.columns = [
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Customer', key: 'customer', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Rating', key: 'rating', width: 10 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Review', key: 'review', width: 50 },
      { header: 'Order #', key: 'order', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Status', key: 'status', width: 15 }
    ];
    

    reviews.forEach(review => {
      let status = review.status;
      if (review.hidden) {
        status = 'Hidden';
      }
      
      worksheet.addRow({
        product: review.productId?.name || 'Unknown Product',
        customer: review.userId?.fullname || 'Unknown User',
        email: review.userId?.email || 'N/A',
        rating: review.rating,
        title: review.title || '',
        review: review.description || '',
        order: review.orderId?.orderNumber || 'N/A',
        date: new Date(review.createdAt).toLocaleDateString(),
        status: status
      });
    });
    

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' }
    };
    worksheet.getRow(1).font = {
      color: { argb: 'FFFFFFFF' },
      bold: true
    };
    
 
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reviews-${new Date().toISOString().slice(0,10)}.xlsx`);
    

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting reviews:", error);
    res.status(500).send("Failed to export reviews");
  }
};


const verifyReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    review.isVerified = true;
    await review.save();

    return res.status(200).json({
      success: true,
      message: "Review verified successfully"
    });
  } catch (error) {
    console.error("Error verifying review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify review"
    });
  }
};

const bulkApproveReviews = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No review IDs provided"
      });
    }

    const result = await Review.updateMany(
      { _id: { $in: ids } },
      { 
        $set: { 
          status: "Approved", 
          hidden: false,
          isVerified: true,
          rejectionReason: ""
        } 
      }
    );


    const reviews = await Review.find({ _id: { $in: ids } }).distinct("productId");
    

    for (const productId of reviews) {
      await updateProductRatings(productId);
    }

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} reviews approved successfully`
    });
  } catch (error) {
    console.error("Error bulk approving reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve reviews"
    });
  }
};


const bulkHideReviews = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No review IDs provided"
      });
    }


    const result = await Review.updateMany(
      { _id: { $in: ids } },
      { $set: { hidden: true } }
    );


    const reviews = await Review.find({ _id: { $in: ids } }).distinct("productId");
    
    for (const productId of reviews) {
      await updateProductRatings(productId);
    }

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} reviews hidden successfully`
    });
  } catch (error) {
    console.error("Error bulk hiding reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to hide reviews"
    });
  }
};

module.exports = {
  getAllReviews,
  getReviewById,
  approveReview,
  rejectReview,
  hideReview,
  showReview,
  deleteReview,
  verifyReview,
  getReviewStatistics,
  exportReviewsCSV,
  exportReviewsExcel,
  bulkApproveReviews,
  bulkHideReviews
};