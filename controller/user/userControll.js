const { render } = require("ejs");
const nodemailer = require("nodemailer");
const session = require("express-session");
const bcrypt = require('bcrypt');
require("dotenv").config();
const User = require("../../model/userSChema");

const generateOtp = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
};

const sendVerificationEmail = async (email, otp) => {
    try {
        const transport = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD,
            },
        });

        await transport.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
        });

        console.log(" Email sent successfully to:", email);
        return true;
    } catch (error) {
        console.error(" Error sending email:", error);
        return false;
    }
};

const pageNotfound = async (req, res) => {
    try {
        
        return res.render("page-404");
    } catch (error) {
        console.error("Error rendering 404 page:", error);
        res.status(500).send("Error loading error page");
    }
};

const loadHomepage = async (req, res) => {
    try {
        return res.render("home");
    } catch (error) {
        console.log(" Home page is not found");
        res.status(500).send("Server error");
    }
};

const userSignup = async (req, res) => {
    try {
        console.log("Session before saving OTP:", req.session);

        const { fullname, email, mobile, password, cpassword } = req.body;

        if (password !== cpassword) {
            return res.render("signup", { message: "Passwords do not match" });
        }

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render("signup", { message: "User with this Email already exists" });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render("signup", { message: "Failed to send OTP. Try again." });
        }

        req.session.userOtp = otp; 
        req.session.userData = { fullname, email, mobile, password };

        console.log("Session after saving OTP:", req.session);
        return res.redirect("/verify-otp");
    } catch (error) {
        console.log("Signup OTP error:", error);
        return res.redirect("/page-not-found");
    }
};

const loadUserSignup = async (req, res) => {
    try {
        return res.render("signup");
    } catch (error) {
        console.log(" Signup page is not found");
        res.status(500).send("Server issue");
    }
};



const securePassword = async (password) => {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
};

const verifyOtp = async (req, res) => {
    try {
        console.log("Verifying OTP...");
        console.log("Session Data:", req.session);
        console.log("Received OTP:", req.body.otp);
        console.log("Stored OTP:", req.session.userOtp);

        if (!req.session || !req.session.userOtp) {
            console.log("Session expired or no OTP found in session");
            return res.status(400).json({ 
                success: false, 
                message: "Session expired. Please request a new OTP." 
            });
        }

        if (req.body.otp == req.session.userOtp) {
            console.log("OTP matched!");
            const user = req.session.userData;
            
            if (!user) {
                console.log("User data not found in session");
                return res.status(400).json({ 
                    success: false, 
                    message: "User data not found. Please sign up again." 
                });
            }
            
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                fullname: user.fullname,
                email: user.email,
                mobile: user.mobile,
                password: passwordHash
            });

            await saveUserData.save();
            console.log("User saved successfully");

            req.session.user = saveUserData._id;
            delete req.session.userOtp;
            delete req.session.userData;

            console.log("Sending success response");
            return res.json({ 
                success: true, 
                redirectUrl: "/" 
            });
        } else {
            console.log("OTP did not match");
            return res.status(400).json({ 
                success: false, 
                message: "Invalid OTP. Please try again" 
            });
        }
    } catch (error) {
        console.error("Error on verifying the OTP:", error);
        return res.status(500).json({ 
            success: false, 
            message: "An error occurred" 
        });
    }
};

const resendOtp = async (req, res) => {
    try {
        console.log("Resending OTP, Session data:", req.session);
        
        if (!req.session || !req.session.userData) {
            console.log("No user data in session");
            return res.status(400).json({
                success: false, 
                message: "Session expired. Please sign up again."
            });
        }
        
        const { email } = req.session.userData;
        if (!email) {
            console.log("Email not found in session");
            return res.status(400).json({
                success: false, 
                message: "Email is not found in the Session"
            });
        }
        
        const otp = generateOtp();
        req.session.userOtp = otp; 
        
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            
            req.session.save(err => {
                if (err) {
                    console.error("Error saving session:", err);
                    return res.status(500).json({
                        success: false, 
                        message: "Error saving session"
                    });
                }
                
                return res.status(200).json({
                    success: true, 
                    message: "OTP resent successfully"
                });
            });
        } else {
            return res.status(500).json({
                success: false, 
                message: "Failed to resend the OTP. Please try again"
            });
        }
    } catch (error) {
        console.error("Error on resending the OTP:", error);
        return res.status(500).json({
            success: false, 
            message: 'Internal server issue. Please try again'
        });
    }
};

const userLogin = async (req, res) => {
    try {
        if(!req.session.user){
            return res.render("login");
        }else{
            res.redirect('/')
        }
    } catch (error) {
        console.log(" User login page is not found");
        res.status(500).send("Server issue");
    }
};

const login = async (req,res)=>{
    try {
        const {email, password} = req.body;
        const findUser = await User.findOne({isAdmin:0, email:email})
        if(!findUser){
            return res.rendr("login",{message: "User not found"})
        }
        if(findUser.isBlocked){
            return re.render("login",{message: "User blocked by the admin"})
        }
        const passwordMatch = await bcrypt.compare(password,findUser.password)
        if(!passwordMatch){
            return res.render('login',{message:"Incorrect password"})
        }
        req.session.user = findUser._id;
        return res.redirect('/')
        
    } catch (error) {
        console.log("loging error",error)
        res.render("login",{message:'login failed please try again later'})
        
    }
}

module.exports = {
    loadHomepage,
    pageNotfound,
    userSignup,
    userLogin,
    loadUserSignup,
    verifyOtp,
    resendOtp,
    login
};