const Banner = require("../../model/BannerScheema")  
const path = require("path");
const fs = require("fs");

const getbannerPage = async (req, res) => {
    try {
        const findBanner = await Banner.find({});
        res.render("banner", { data: findBanner });
    } catch (error) {
        console.error("Error fetching banners:", error); 
        res.redirect("/pageerror");
    }
};
const getaddBanner = async (req,res)=>{
    try {
        res.render("addBanner")
    } catch (error) {
        rer.redirect("/pageerror")
        
    }
}

module.exports = {
    getbannerPage,
    getaddBanner
};
