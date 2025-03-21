const user = require("../../model/userSChema");

const pageNotfound = async (req, res) => {
    try {
        return res.render("page-404");
    } catch (error) {
        res.redirect("/pageNotfound");
    }
};

const loadHomepage = async (req, res) => {
    try {
        return res.render("home");
    } catch (error) {
        console.log("Home page is not found");
        res.status(500).send("Server error");
    }
};

const userSignup = async (req, res) => {
    let { name, email, mobile, password } = req.body;
    try {
        const newUser = new user({ name, email, mobile, password });
        console.log(newUser)
        await newUser.save();
        return res.redirect('/signup');
    } catch (error) {
        console.error("Error saving data:", error);
        res.status(500).send("Internal server error");
    }
};

let loadUserSignup = async (req, res) => {
    try {
        return res.render('signup');
    } catch (error) {
        console.log("Signup page is not found");
        res.status(500).send("Server issue");
    }
};

let userLogin = async (req, res) => {
    try {
        return res.render('login');
    } catch (error) {
        console.log("User login page is not found");
        res.status(500).send("Server issue");
    }
};

module.exports = {
    loadHomepage,
    pageNotfound,
    userSignup,
    userLogin,
    loadUserSignup
};
