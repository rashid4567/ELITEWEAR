const User = require("../model/userSchema");

const UserAuth = async (req, res, next) => {
  try {
  
    if (req.session.user) {
      const user = await User.findById(req.session.user);
      if (user && !user.isBlocked) {
        req.user = user;
        return next();
      }
     
      req.session.destroy(() => {
        return res.redirect("/login?message=User blocked or not found");
      });
    } else {
      console.log("No session.user found");
      return res.redirect("/login?message=Please log in");
    }
  } catch (error) {
    console.error("UserAuth error:", error);
    return res.redirect("/login?message=Server error");
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