const mongoose = require("mongoose");
const User = require("../../model/userSchema");
const bcrypt = require("bcrypt");

const loadLogin = async (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  res.render("adminlogin", { message: null });
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({ email, isAdmin: true });

    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);

      if (passwordMatch) {
        req.session.admin = admin._id;

        req.session.save((err) => {
          if (err) {
            return res.render("adminlogin", { message: "Session error" });
          }
          return res.redirect("/admin/dashboard");
        });
      } else {
        return res.render("adminlogin", { message: "Invalid password" });
      }
    } else {
      console.error("Admin not found for email:", email);
      return res.render("adminlogin", { message: "Admin not found" });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.render("adminlogin", { message: "An error occurred" });
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
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const sessionId = req.session.admin;
    req.session.destroy((err) => {
      if (err) {
        console.error("Error in admin logout:", err);
        return res.redirect("/admin/errorpage");
      }

      res.redirect("/admin/login");
    });
  } catch (error) {
    console.error("Admin logout error:", error);
    res.redirect("/admin/errorpage");
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  logout,
};
