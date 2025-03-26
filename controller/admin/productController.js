const Product = require("../../model/productScheema");
const Category = require("../../model/categoryScheema");
const path = require('path');
const fs = require('fs').promises;
const sharp = require("sharp");
const { count } = require("console");


const ProductManagement = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = 4;

     
        const count = await Product.countDocuments({
            $or: [
                { ProductName: { $regex: new RegExp(search, "i") } },
                { brand: { $regex: new RegExp(search, "i") } }
            ]
        });

       
        const productData = await Product.find({
            $or: [
                { ProductName: { $regex: new RegExp(search, "i") } },
                { brand: { $regex: new RegExp(search, "i") } }
            ]
        })
        .limit(limit)
        .skip((page - 1) * limit)
        .populate("Category")
        .exec();

        // Fetch active categories
        const category = await Category.find({ isListed: true });

        if (category.length > 0) {
            res.render("prodectManagment", {
                data: productData,
                currentPage: page,
                totalPage: Math.ceil(count / limit),
                cat: category,
                // sales:salePrice,
                // stock:quantity
            });
        } else {
            return res.status(404).render("page-404");
        }
    } catch (error) {
        console.error("Error fetching product management:", error);
        res.status(500).send("Internal Server Error");
    }
};


const getaddproduct = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        res.render("addproduct", { categories });
    } catch (error) {
        console.error("Error fetching add product page:", error);
        res.redirect("/pageerror");
    }
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
const addproduct = async (req, res) => {
    console.log('Add product request started');
    try {
        console.log('Incoming files:', Object.keys(req.files || {}));

        const {
            productName,
            productPrice,
            productDescription,
            productCategory,
            productOffer,
            sizes,
            totalStockQuantity,
            sku, 
            brand 
        } = req.body;

    
        const requiredFields = [
            'productName', 'productPrice', 'productDescription',
            'productCategory', 'productOffer', 'totalStockQuantity'
        ];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            console.log('Missing fields:', missingFields);
            return res.status(400).render("addproduct", {
                error: `Missing required fields: ${missingFields.join(', ')}`,
                categories: await Category.find({ isListed: true }),
            });
        }

    
        const images = [];
        if (req.files) {
            console.log('Processing files:', Object.keys(req.files));

            const processImage = (file) => {
                if (!file || !file.path) {
                    console.error('Invalid file object:', file);
                    return null;
                }
                return {
                    url: file.path,
                    thumbnail: file.path,
                    isMain: false
                };
            };

            if (req.files.mainImage && req.files.mainImage[0]) {
                const mainImg = processImage(req.files.mainImage[0]);
                if (mainImg) {
                    mainImg.isMain = true;
                    images.push(mainImg);
                }
            }

            for (let i = 1; i <= 3; i++) {
                const fieldName = `additionalImage${i}`;
                if (req.files[fieldName] && req.files[fieldName[0]]) {
                    const additionalImg = processImage(req.files[fieldName][0]);
                    if (additionalImg) images.push(additionalImg);
                }
            }
        }

        if (images.length === 0) {
            return res.status(400).render("addproduct", {
                error: "Please upload at least one valid product image",
                categories: await Category.find({ isListed: true }),
            });
        }

        const categoryData = await Category.findOne({ name: productCategory });
        if (!categoryData) {
            return res.status(400).render("addproduct", {
                error: "Invalid category",
                categories: await Category.find({ isListed: true }),
            });
        }


        const regularPrice = parseFloat(productPrice);
        const offer = parseFloat(productOffer);
        const salePrice = regularPrice * (1 - offer / 100);

        const variants = Array.isArray(sizes)
            ? sizes.map((size) => ({
                size, 
                regularPrice,
                salePrice,
                quantity: Math.floor(parseInt(totalStockQuantity) / sizes.length),
            }))
            : [{
                size: sizes,
                regularPrice,
                salePrice,
                quantity: parseInt(totalStockQuantity),
            }];

        const newProduct = new Product({
            name: productName,
            description: productDescription,
            categoryId: categoryData._id,
            brand: brand || undefined, 
            offer,
            images,
            variants,
            sku: sku || undefined, 
            tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags]) : [],
            ratings: { average: 0, count: 0 },
            isActive: true
        });

        await newProduct.save();
        console.log('Product saved successfully');
        return res.redirect("/admin/productManagment");

    } catch (error) {
        console.error('Product Add Error:', error);
        return res.status(500).render("addproduct", {
            error: "Failed to add product: " + error.message,
            categories: await Category.find({ isListed: true }),
        });
    }
};
module.exports = {
  
    ProductManagement,
    getaddproduct,
    addproduct,
    
};
