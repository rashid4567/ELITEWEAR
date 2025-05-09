const User = require("../../model/userSchema");
const Wallet = require("../../model/walletScheema");
const Order = require("../../model/orderSchema");
const OrderItem = require("../../model/orderItemSchema");
const Review = require("../../model/ReviewScheema");
const mongoose = require("mongoose")

const customerInfo = async (req, res) => {
  try {
    let search = "";
    if (req.query.search) {
      search = req.query.search;
    }

    let page = 1;
    if (req.query.page) {
      page = parseInt(req.query.page);
    }
    const limit = 5;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { fullname: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    // Get additional data for each user
    const enhancedUserData = await Promise.all(
      userData.map(async (user) => {
        // Get order count for each user
        const orderCount = await Order.countDocuments({ userId: user._id });
        
        // Get wallet balance
        const wallet = await Wallet.findOne({ userId: user._id });
        const walletBalance = wallet ? wallet.balance : 0;
        
        return {
          ...user.toObject(),
          orderCount,
          walletBalance
        };
      })
    );

    const count = await User.find({
      isAdmin: false,
      $or: [
        { fullname: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    }).countDocuments();

    const totalPages = Math.ceil(count / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.render("userManagement", {
      search: search,
      users: enhancedUserData,
      pagination: {
        totalUsers: count,
        totalPages: totalPages,
        currentPage: page,
        hasNextPage: hasNextPage,
        hasPrevPage: hasPrevPage,
        limit: limit,
      },
    });
  } catch (error) {
    console.error("Error in customerInfo controller:", error);
    res.status(500).render("error", {
      message: "Internal server error",
      error: error.message,
    });
  }
};

const customerBlocked = async (req, res) => {
  try {
    let id = req.query.id;
    await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.json({ success: true, isBlocked: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const customerUnblocked = async (req, res) => {
  try {
    let id = req.query.id;
    await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.json({ success: true, isBlocked: false });
  } catch (error) {
    console.error("Admin unable to unblock customer:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get detailed information about a specific customer
 * This function fetches user details, wallet transactions, order history, and reviews
 */
// Controller function to get customer details
const getCustomerDetails = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get wallet information
    const wallet = await Wallet.findOne({ userId });
    const walletBalance = wallet ? wallet.amount : 0;

    // Get orders
    const orders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('address')
      .lean();

    // Get order items count for each order
    const orderIds = orders.map(order => order._id);
    const orderItemCounts = await OrderItem.aggregate([
      { $match: { orderId: { $in: orderIds } } },
      { $group: { _id: '$orderId', count: { $sum: 1 } } }
    ]);

    // Create a map of order ID to item count
    const orderItemCountMap = {};
    orderItemCounts.forEach(item => {
      orderItemCountMap[item._id.toString()] = item.count;
    });

    // Add item count to each order
    const ordersWithItemCount = orders.map(order => ({
      ...order,
      totalItems: orderItemCountMap[order._id.toString()] || 0
    }));

    // Get total orders count
    const totalOrders = await Order.countDocuments({ userId });

    // Get reviews
    const reviews = await Review.find({ userId })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('productId', 'name')
      .lean();

    // Get total reviews count
    const totalReviews = await Review.countDocuments({ userId });

    // Get recent wallet transactions
    const recentTransactions = wallet ? 
      wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5) : 
      [];

    // Prepare response data
    const responseData = {
      success: true,
      data: {
        user,
        wallet: {
          balance: walletBalance,
          transactions: recentTransactions
        },
        orders: {
          recent: ordersWithItemCount,
          total: totalOrders
        },
        reviews,
        stats: {
          totalOrders,
          totalReviews,
          walletBalance
        }
      }
    };

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching customer details:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while fetching customer details',
      error: error.message
    });
  }
};

// Controller function to get customer orders with pagination
const getCustomerOrders = async (req, res) => {
  try {
    const userId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Get orders with pagination
    const orders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('address')
      .lean();

    // Get order items count for each order
    const orderIds = orders.map(order => order._id);
    const orderItemCounts = await OrderItem.aggregate([
      { $match: { orderId: { $in: orderIds } } },
      { $group: { _id: '$orderId', count: { $sum: 1 } } }
    ]);

    // Create a map of order ID to item count
    const orderItemCountMap = {};
    orderItemCounts.forEach(item => {
      orderItemCountMap[item._id.toString()] = item.count;
    });

    // Add item count to each order
    const ordersWithItemCount = orders.map(order => ({
      ...order,
      totalItems: orderItemCountMap[order._id.toString()] || 0
    }));

    // Get total orders count for pagination
    const totalOrders = await Order.countDocuments({ userId });
    const totalPages = Math.ceil(totalOrders / limit);

    return res.status(200).json({
      success: true,
      data: {
        orders: ordersWithItemCount,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalOrders,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while fetching customer orders',
      error: error.message
    });
  }
};

// Controller function to get customer wallet transactions with pagination
const getCustomerWallet = async (req, res) => {
  try {
    const userId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(200).json({
        success: true,
        data: {
          balance: 0,
          transactions: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            hasNextPage: false,
            hasPrevPage: false
          }
        }
      });
    }

    // Sort transactions by date (newest first)
    const sortedTransactions = wallet.transactions.sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );

    // Apply pagination
    const totalTransactions = sortedTransactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTransactions = sortedTransactions.slice(startIndex, endIndex);

    return res.status(200).json({
      success: true,
      data: {
        balance: wallet.amount,
        transactions: paginatedTransactions,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalTransactions,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching customer wallet:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while fetching customer wallet',
      error: error.message
    });
  }
};
// Controller function to update customer profile
const updateCustomerProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const { fullname, email, mobile, isBlocked, address } = req.body;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Update user basic info
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        fullname, 
        email, 
        mobile, 
        isBlocked 
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if we need to update or create an address
    if (address) {
      // Check if user already has a default address
      let existingAddress = await Address.findOne({ 
        userId: userId,
        isDefault: true
      });

      if (existingAddress) {
        // Update existing address
        await Address.findByIdAndUpdate(
          existingAddress._id,
          {
            fullname: fullname,
            mobile: mobile,
            address: address.address,
            district: address.district,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            landmark: address.landmark,
            type: address.type
          }
        );
      } else {
        // Create new address
        await Address.create({
          userId: userId,
          fullname: fullname,
          mobile: mobile,
          address: address.address,
          district: address.district,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          landmark: address.landmark || '',
          type: address.type || 'Home',
          isDefault: true
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Customer profile updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Error updating customer profile:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while updating customer profile',
      error: error.message
    });
  }
};

module.exports = {
  customerBlocked,
  customerUnblocked,
  customerInfo,
  getCustomerDetails,
  getCustomerOrders,
  getCustomerWallet,
  updateCustomerProfile,
};