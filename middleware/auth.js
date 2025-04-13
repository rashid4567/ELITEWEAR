const User = require('../model/userSchema');

const UserAuth = (req, res, next) => {
    if (req.user) {
      if (!req.user.isBlocked) {
        req.session.user = req.user; 
        next();
      } else {
        req.session.destroy(() => res.redirect('/login'));
      }
    } else if (req.session.user) {
      User.findById(req.session.user._id || req.session.user)
        .then((user) => {
          if (user && !user.isBlocked) {
            req.session.user = user;
            req.user = user;
            next();
          } else {
            req.session.destroy(() => res.redirect('/login'));
          }
        })
        .catch((error) => {
          console.error('Error in UserAuth middleware:', error);
          res.status(500).send('Internal server issue');
        });
    } else {
      res.redirect('/login');
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
                    res.redirect('/admin/login');
                }
            })
            .catch((error) => {
                console.error('Error in adminAuth middleware:', error);
                res.status(500).send('Internal server issue');
            });
    } else {
        res.redirect('/admin/login');
    }
};

module.exports = { UserAuth, adminAuth };