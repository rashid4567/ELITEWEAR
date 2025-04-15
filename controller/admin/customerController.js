const User = require("../../model/userSchema");

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
      users: userData,
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

module.exports = {
  customerBlocked,
  customerUnblocked,
  customerInfo,
};
