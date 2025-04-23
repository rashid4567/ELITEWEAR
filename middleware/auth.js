const User = require("../model/userSchema");

const UserAuth = async (req, res, next) => {
  try {
    console.log("UserAuth - session.user:", req.session.user); // Debug log
    if (req.session.user) {
      const user = await User.findById(req.session.user);
      console.log("UserAuth - found user:", user); // Debug log
      if (user && !user.isBlocked) {
        req.user = user; // Attach full user object to req.user
        return next();
      }
      console.log("UserAuth - user blocked or not found"); // Debug log
      req.session.destroy(() => res.redirect("/login?message=User blocked or not found"));
    } else {
      console.log("UserAuth - no session, redirecting to login"); // Debug log
      res.redirect("/login?message=Please log in");
    }
  } catch (error) {
    console.error("UserAuth: Error:", error.message, error.stack);
    res.redirect("/login?message=Server error");
  }
};

const adminAuth = (req, res, next) => {
  if (req.session.admin) {
    User.findById(req.session.admin)
      .then((admin) => {
        if (admin && admin.isAdmin) {
          next();
        } else {
          req.session.destroy();
          res.redirect("/admin/login");
        }
      })
      .catch((error) => {
        console.error("Error in adminAuth middleware:", error);
        res.status(500).send("Internal server issue");
      });
  } else {
    res.redirect("/admin/login");
  }
};

module.exports = { UserAuth, adminAuth };