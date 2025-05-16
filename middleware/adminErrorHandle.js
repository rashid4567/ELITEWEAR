const User = require("../model/userSchema");

const adminNotFoundHandler = async (req, res, next) => {
  if (!req.originalUrl.startsWith("/admin")) {
    return next();
  }

  if (req.route) {
    return next();
  }

  try {
    let adminData = null;
    if (req.session && req.session.admin) {
      adminData = await User.findById(req.session.admin);
    }
    return res.status(404).render("error-404", { user: adminData });
  } catch (error) {
    console.error("Error in admin 404 handler:", error);

    return next(error);
  }
};

module.exports = adminNotFoundHandler;
