const User = require("../../model/userSchema");
const bcrypt = require("bcrypt");

const getAdminProfile = async (req, res) => {
  try {
    const adminId = req.session.admin;

    const admin = await User.findById(adminId);

    if (!admin || !admin.isAdmin) {
      req.flash("error", "Admin not found or unauthorized");
      return res.redirect("/admin/login");
    }

    res.render("adminProfile", {
      admin,
      messages: {
        success: req.flash("success"),
        error: req.flash("error"),
      },
    });
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    req.flash("error", "An error occurred while fetching your profile");
    res.redirect("/admin");
  }
};

const changeAdminPassword = async (req, res) => {
  try {
    console.log("Password change request received:", req.body);
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const adminId = req.session.admin;

    console.log("Admin ID from session:", adminId);

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash("error", "All fields are required");
      return res.redirect("/admin/profile");
    }

    if (newPassword !== confirmPassword) {
      req.flash("error", "New password and confirm password do not match");
      return res.redirect("/admin/profile");
    }

    if (newPassword.length < 8) {
      req.flash("error", "Password must be at least 8 characters long");
      return res.redirect("/admin/profile");
    }

    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(
      newPassword
    );

    if (!hasUppercase || !hasLowercase || !hasNumberOrSpecial) {
      req.flash(
        "error",
        "Password must include uppercase, lowercase, and numbers or special characters"
      );
      return res.redirect("/admin/profile");
    }

    // Find admin user
    const admin = await User.findById(adminId);
    console.log("Admin found:", admin ? "Yes" : "No");

    if (!admin || !admin.isAdmin) {
      req.flash("error", "Admin not found or unauthorized");
      return res.redirect("/admin/login");
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      admin.password
    );
    console.log("Current password valid:", isPasswordValid);

    if (!isPasswordValid) {
      req.flash("error", "Current password is incorrect");
      return res.redirect("/admin/profile");
    }

    const isSamePassword = await bcrypt.compare(newPassword, admin.password);
    console.log("New password same as current:", isSamePassword);

    if (isSamePassword) {
      req.flash(
        "error",
        "New password must be different from current password"
      );
      return res.redirect("/admin/profile");
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    admin.password = hashedPassword;
    await admin.save();
    console.log("Password updated successfully");

    req.flash("success", "Password updated successfully");
    res.redirect("/admin/profile");
  } catch (error) {
    console.error("Error changing admin password:", error);
    req.flash("error", "An error occurred while changing your password");
    res.redirect("/admin/profile");
  }
};

module.exports = {
  getAdminProfile,
  changeAdminPassword,
};