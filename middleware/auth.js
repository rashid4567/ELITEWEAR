const User = require('../model/userSchema');

const UserAuth = (req, res, next) => {
    if (req.user) {
        // User is authenticated via Passport.js (Google or normal)
        if (!req.user.isBlocked) {
            next();
        } else {
            req.session.destroy(() => {
                res.redirect('/login');
            });
        }
    } else if (req.session.user) {
        // Fallback for legacy session-based auth
        User.findById(req.session.user._id)
            .then((user) => {
                if (user && !user.isBlocked) {
                    req.user = user;
                    next();
                } else {
                    req.session.destroy(() => {
                        res.redirect('/login');
                    });
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