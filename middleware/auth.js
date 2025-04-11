const User = require('../model/userSChema');

const UserAuth = (req, res, next) => {
    if (req.session.user) {
      User.findById(req.session.user._id)
        .then((user) => {
          if (user && !user.isBlocked) {
            next();
          } else {
            req.session.destroy();
            res.redirect("/login");
          }
        })
        .catch((error) => {
          console.error("Error in userAuth middleware:", error);
          res.status(500).send("Internal server issue");
        });
    } else {
      res.redirect("/login");
    }
  };
const adminAuth = (req, res, next) => {
    if (req.session.admin) { 
        User.findById(req.session.admin) 
            .then(admin => {
                if (admin && admin.isAdmin) {
                    next();
                } else {
                    req.session.destroy(); 
                    res.redirect("/admin/login");
                }
            })
            .catch(error => {
                console.error("Error in adminAuth middleware:", error);
                res.status(500).send("Internal server issue");
            });
    } else {
        res.redirect("/admin/login");
    }
};

module.exports = { UserAuth, adminAuth };