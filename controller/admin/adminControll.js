const mongoose = require('mongoose');
const User = require("../../model/userSChema");
const bcrypt = require('bcrypt');

const loadLogin = async (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    res.render('adminlogin', { message: null });
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("Login attempt for:", email);

        const admin = await User.findOne({ email, isAdmin: true });

        if (admin) {
            console.log("Admin found:", admin.email);


            console.log("Password attempt:", password.substring(0, 1) + "*****");

            const passwordMatch = await bcrypt.compare(password, admin.password);
            console.log("Password match result:", passwordMatch);

            if (passwordMatch) {

                req.session.admin = admin._id;


                req.session.save(err => {
                    if (err) {

                        return res.render('adminlogin', { message: "Session error" });
                    }
                    return res.redirect('/admin/dashboard');
                });
            } else {
                console.log("Password did not match");
                return res.render('adminlogin', { message: "Invalid password" });
            }
        } else {
            console.log("Admin not found for email:", email);
            return res.render('adminlogin', { message: "Admin not found" });
        }
    } catch (error) {
        console.error("Login error:", error);
        return res.render('adminlogin', { message: "An error occurred" });
    }
};

const loadDashboard = async (req, res) => {
    try {
        if (req.session.admin) {


            return res.render("dashboard");
        } else {
            console.log("Dashboard access attempt without session");
            return res.redirect("/admin/login");
        }
    } catch (error) {
        console.error("Dashboard error:", error);
        return res.redirect("/admin/login");
    }
};

const logout = async (req, res) => {
    try {
        if (!req.session.admin) {
            console.log("Logout attempted without active session");
            return res.redirect("/admin/login");
        }

        const sessionId = req.session.admin;
        req.session.destroy((err) => {
            if (err) {
                console.error("Error in admin logout:", err);
                return res.redirect('/admin/errorpage');
            }
            console.log("Admin logged out successfully, session destroyed:", sessionId);
            res.redirect("/admin/login");
        });
    } catch (error) {
        console.error("Admin logout error:", error);
        res.redirect('/admin/errorpage');
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    logout
};