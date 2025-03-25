const Product = require("../../model/productScheema")
const Category = require("../../model/categoryScheema")
const User = require('../../model/userSChema')
const path = require('path');
const fs = require('fs');
const sharp = require("sharp")

const getProductManagement = async (req,res) =>{
    try {
        const category = await Category.find({isListed: true})
        res.render("productAdd",{
            cat:category,
        })
    } catch (error) {
        res.redirect("/pageerror")
    }
    
}


module.exports = {
    getProductManagement
}