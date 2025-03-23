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
        console.log("Login attempt:", email);
        
        const admin = await User.findOne({ email, isAdmin: true });

        if (admin) {
            console.log("Admin found:", admin.email);
            const passwordMatch = await bcrypt.compare(password, admin.password);
            
            if (passwordMatch) {
                req.session.admin = admin._id;
                console.log("Password matched, setting session:", req.session.admin);
                return res.redirect('/admin');
            } else {
                console.log("Password did not match");
                return res.render('adminlogin', { message: "Invalid password" });
            }
        } else {
            console.log("Admin not found");
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
            return res.redirect("/admin/login");
        }
    } catch (error) {
        console.error("Dashboard error:", error);
        return res.redirect("/admin/login");
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.log("Error in admin logout:", err);
                return res.redirect('/admin/errorpage');
            }
            console.log("Admin logged out successfully");
            res.redirect("/admin/login");
        });
    } catch (error) {
        console.log("Admin logout error:", error);
        res.redirect('/admin/errorpage');
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    logout
};