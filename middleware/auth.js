const User = require("../model/userSchema");

const UserAuth = async (req, res, next) => {
  try {
   
    if (req.user) {
      if (!req.user.isBlocked) {
     
        next();
      } else {
       
        req.session.destroy(() => res.redirect("/login"));
      }
    } else if (req.session.user && req.session.user._id) {
      const user = await User.findById(req.session.user._id);
      if (user && !user.isBlocked) {
    
        req.user = user; 
        next();
      } else {
        
        req.session.destroy(() => res.redirect("/login"));
      }
    } else {
      
      res.redirect("/login");
    }
  } catch (error) {
    console.error("UserAuth: Error:", error.message, error.stack);
    res.redirect("/login");
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