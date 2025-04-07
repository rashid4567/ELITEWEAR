const Product = require("../../model/productScheema");
const Category = require("../../model/categoryScheema");
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const sharp = require("sharp");
const { count } = require("console");
const { unlink } = require("fs");

const ProductManagement = async (req, res) => {
    try {
        const search = req.query.search || "";
        const categoryFilter = req.query.category || "";
        const brandFilter = req.query.brand || "";
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = 6;

        let query = {
            $and: [
                {
                    $or: [
                        { name: { $regex: ".*" + search + ".*", $options: "i" } },
                        { brand: { $regex: ".*" + search + ".*", $options: "i" } }
                    ]
                }
            ]
        };


        if (categoryFilter && categoryFilter !== "all") {
            const categoryData = await Category.findOne({ name: categoryFilter });
            if (categoryData) {
                query.$and.push({ categoryId: categoryData._id });
            } else {
                console.error(`Category not found: ${categoryFilter}`);
            }
        }

        
        if (brandFilter) {
            query.$and.push({ brand: { $regex: ".*" + brandFilter + ".*", $options: "i" } });
        }

        const count = await Product.countDocuments(query);

        const totalPages = Math.ceil(count / limit);
        const safePage = Math.min(page, totalPages);
        const skip = (safePage - 1) * limit;

        const productData = await Product.find(query)
            .limit(limit)
            .skip(skip)
            .populate("categoryId")
            .exec();

        const category = await Category.find({ isListed: true });

        if (!category.length) {
            return res.status(404).render("page-404");
        }

        let message = "";
        if (!productData.length) {
            message = search 
                ? `Sorry, no products found for "${search}"`
                : "Sorry, no products are available";
        }

        const formattedProductData = productData.map(product => {
            const firstVariant = product.variants[0] || {};
            const totalStock = product.variants.reduce((sum, variant) => sum + (variant.varientquatity || 0), 0);
            return {
                ...product.toObject(),
                salePrice: firstVariant.salePrice || 0,
                varientquatity: totalStock 
            };
        });
        res.render("prodectManagment", {
            search,
            categoryFilter,
            brandFilter,
            data: formattedProductData,
            currentPage: safePage,
            totalPage: totalPages,
            cat: category,
            sales: formattedProductData[0]?.salePrice || 0,
            stock: formattedProductData[0]?.quantity || 0,
            message: message
        });

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
        console.log('Incoming files:', req.files);
        console.log('Incoming body:', req.body);

        const {
            productName,
            productPrice,
            productDescription,
            productCategory,
            productOffer,
            variants,
            color,
            fabric,
            sku,
            brand
        } = req.body;

        const requiredFields = ['productName', 'productDescription', 'productCategory', 'color', 'fabric'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            return res.status(400).render("addproduct", {
                error: `Missing required fields: ${missingFields.join(', ')}`,
                categories: await Category.find({ isListed: true }),
            });
        }

        const images = [];
        if (req.files && req.files.mainImage) {
            images.push({
                url: req.files.mainImage[0].path,
                thumbnail: req.files.mainImage[0].path,
                isMain: true
            });
            for (let i = 1; i <= 3; i++) {
                const fieldName = `additionalImage${i}`;
                if (req.files[fieldName]) {
                    images.push({
                        url: req.files[fieldName][0].path,
                        thumbnail: req.files[fieldName][0].path,
                        isMain: false
                    });
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

        const parsedVariants = Array.isArray(variants) ? variants.map(variant => ({
            size: variant.size,
            varientPrice: parseFloat(variant.varientPrice),
            salePrice: parseInt(variant.varientPrice) * (1 - parseInt(productOffer || 0) / 100),
            varientquatity: parseInt(variant.varientquatity)
        })) : [];

        if (parsedVariants.length === 0) {
            return res.status(400).render("addproduct", {
                error: "Please add at least one variant",
                categories: await Category.find({ isListed: true }),
            });
        }

        const newProduct = new Product({
            name: productName,
            description: productDescription,
            categoryId: categoryData._id,
            brand: brand || undefined,
            offer: parseFloat(productOffer || 0),
            images,
            variants: parsedVariants,
            sku: sku || undefined,
            fabric: fabric.trim(),
            color: color.trim(),
            tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags]) : [],
            ratings: { average: 0, count: 0 },
            isActive: true
        });

        await newProduct.save();
        console.log("Saved product images:", newProduct.images);
        return res.redirect("/admin/productManagment");
    } catch (error) {
        console.error('Product Add Error:', error);
        return res.status(500).render("addproduct", {
            error: "Failed to add product: " + error.message,
            categories: await Category.find({ isListed: true }),
        });
    }
};

const geteditProduct = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.redirect("/admin/productManagment");
        }

        const product = await Product.findById(id).populate('categoryId');
        const categories = await Category.find({ isListed: true });

        if (!product) {
            return res.redirect("/pageerror");
        }

        console.log("Product fetched:", product);
        console.log("Product images:", product.images);
        res.render("editProduct", {
            product: product,
            categories: categories,
            error: null
        });
    } catch (error) {
        console.error("Error in product editing page:", error);
        res.redirect("/pageerror");
    }
};

const editProduct = async (req, res) => {
    console.log('Edit product request started');
    try {
        const id = req.params.id;
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).render("editProduct", {
                error: "Product not found",
                product: null,
                categories: await Category.find({ isListed: true })
            });
        }

        console.log('Incoming files:', req.files);
        console.log('Incoming body:', req.body);

        const {
            productName,
            productDescription,
            productCategory,
            productOffer,
            variants,
            color,
            fabric,
            sku,
            brand
        } = req.body;

      
        const requiredFields = ['productName', 'productDescription', 'productCategory', 'color', 'fabric'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            return res.status(400).render("editProduct", {
                error: `Missing required fields: ${missingFields.join(', ')}`,
                product,
                categories: await Category.find({ isListed: true })
            });
        }

       
        const existProduct = await Product.findOne({
            name: productName,
            _id: { $ne: id }
        });
        if (existProduct) {
            return res.status(400).render("editProduct", {
                error: "Product with this name already exists",
                product,
                categories: await Category.find({ isListed: true })
            });
        }

      
        let images = [...product.images];
        
        
        if (req.files && req.files.mainImage) {
            
            const oldMainImageIndex = images.findIndex(img => img.isMain);
            if (oldMainImageIndex !== -1) {
                images.splice(oldMainImageIndex, 1);
            }
            
           
            images.push({
                url: req.files.mainImage[0].path,
                thumbnail: req.files.mainImage[0].path,
                isMain: true
            });
        }
        
        
        for (let i = 1; i <= 3; i++) {
            const fieldName = `additionalImage${i}`;
            if (req.files && req.files[fieldName]) {
             
                images.push({
                    url: req.files[fieldName][0].path,
                    thumbnail: req.files[fieldName][0].path,
                    isMain: false
                });
            }
        }

      
        if (images.length === 0) {
            return res.status(400).render("editProduct", {
                error: "At least one product image is required",
                product,
                categories: await Category.find({ isListed: true })
            });
        }

       
        const categoryData = await Category.findOne({ name: productCategory });
        if (!categoryData) {
            return res.status(400).render("editProduct", {
                error: "Invalid category",
                product,
                categories: await Category.find({ isListed: true })
            });
        }

     
        let parsedVariants = [];
        if (variants) {
         
            if (Array.isArray(variants)) {
                parsedVariants = variants.map(variant => ({
                    size: variant.size,
                    varientPrice: parseFloat(variant.varientPrice),
                    salePrice: parseFloat(variant.varientPrice) * (1 - parseFloat(productOffer || 0) / 100),
                    varientquatity: parseInt(variant.varientquatity)
                }));
            } else if (typeof variants === 'object') {
               
                parsedVariants = Object.values(variants).map(variant => ({
                    size: variant.size,
                    varientPrice: parseFloat(variant.varientPrice),
                    salePrice: parseFloat(variant.varientPrice) * (1 - parseFloat(productOffer || 0) / 100),
                    varientquatity: parseInt(variant.varientquatity)
                }));
            }
        }

        if (parsedVariants.length === 0) {
            return res.status(400).render("editProduct", {
                error: "Please add at least one variant",
                product,
                categories: await Category.find({ isListed: true })
            });
        }

    
        const updateFields = {
            name: productName,
            description: productDescription,
            brand: brand || undefined,
            categoryId: categoryData._id,
            offer: parseFloat(productOffer || 0),
            sku: sku || undefined,
            fabric: fabric.trim(),
            color: color.trim(),
            images,
            variants: parsedVariants
        };

        const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, { new: true });
        console.log("Updated product details:", updatedProduct);
        
       
        if (req.xhr) {
            return res.json({ 
                success: true, 
                message: "Product updated successfully",
                redirectUrl: "/admin/productManagment"
            });
        } else {
            return res.redirect("/admin/productManagment");
        }

    } catch (error) {
        console.error("Error editing product:", error);
        const errorResponse = {
            error: "Failed to edit product: " + error.message,
            product: await Product.findById(req.params.id),
            categories: await Category.find({ isListed: true })
        };
        
        if (req.xhr) {
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        } else {
            return res.status(500).render("editProduct", errorResponse);
        }
    }
};
const deleteImage = async (req, res) => {
    try {
        const { imageToserver, productToserver } = req.body;
        const product = await Product.findByIdAndUpdate(productToserver, { $pull: { images: { url: imageToserver } } });
        if (!product) {
            return res.status(404).json({ status: false, message: 'Product not found' });
        }

        const imagePath = path.join('public', 'uploads', 're-images', path.basename(imageToserver));
        if (await fs.access(imagePath).then(() => true).catch(() => false)) {
            await fs.unlink(imagePath);
            console.log(`The ${imageToserver} is deleted successfully`);
        } else {
            console.log(`The image ${imageToserver} is not found`);
        }

        res.json({ status: true });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.redirect('/pageerror');
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('Product ID to delete:', productId);

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.log('Invalid product ID format');
            return res.status(400).json({ status: false, message: "Invalid product ID format" });
        }

        const deletedProduct = await Product.findByIdAndDelete(productId);

        if (!deletedProduct) {
            console.log('Product not found in database');
            return res.status(404).json({ status: false, message: "Product not found" });
        }

        console.log('Product deleted successfully:', deletedProduct);

        return res.json({
            status: true,
            message: "Product deleted successfully",
            deletedProductId: productId
        });
    } catch (error) {
        console.error("Error deleting product:", error);
        return res.status(500).json({
            status: false,
            message: "Failed to delete product",
            error: error.message
        });
    }
};

const UnlistProduct = async (req, res) => {
    try {
        let id = req.params.id;
        const result = await Product.updateOne({ _id: id }, { $set: { isActive: false } });
        if (result.modifiedCount === 0) {
            res.status(404).json({ message: "product not found" });
        } else {
            res.json({ success: true, isActive: false });
        }
    } catch (error) {
        console.log("The admin unable to block product", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const listProduct = async (req, res) => {
    try {
        let id = req.params.id;
        const result = await Product.updateOne({ _id: id }, { $set: { isActive: true } });
        if (result.modifiedCount === 0) {
            res.status(404).json({ message: "Product unable to found" });
        } else {
            res.json({ success: true, isActive: true });
        }
    } catch (error) {
        console.log("The admin can unable to list the product", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
const filterProduct = async (req, res) => {
    try {
        const { category, minPrice, maxPrice, sort, search } = req.query;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = 6; 

        
        let query = {
            $and: [
                {
                    $or: [
                        { name: { $regex: ".*" + (search || "") + ".*", $options: "i" } },
                        { brand: { $regex: ".*" + (search || "") + ".*", $options: "i" } }
                    ]
                },
                { isActive: true }
            ]
        };

       
        if (category && category !== "all") {
            const categoryData = await Category.findOne({ name: category });
            if (categoryData) {
                query.$and.push({ categoryId: categoryData._id });
            }
        }

     
        let pipeline = [{ $match: query }];

        
        pipeline.push({ $unwind: "$variants" });

       
        if (minPrice || maxPrice) {
            let priceMatch = {};
            if (minPrice) priceMatch["variants.salePrice"] = { $gte: parseFloat(minPrice) };
            if (maxPrice) {
                priceMatch["variants.salePrice"] = priceMatch["variants.salePrice"] || {};
                priceMatch["variants.salePrice"].$lte = parseFloat(maxPrice);
            }
            pipeline.push({ $match: priceMatch });
        }

       
        let sortStage = {};
        switch (sort) {
            case "desc":
                sortStage = { $sort: { "variants.salePrice": -1 } };
                break;
            case "asc":
                sortStage = { $sort: { "variants.salePrice": 1 } };
                break;
            case "latest":
                sortStage = { $sort: { createdAt: -1 } };
                break;
            default:
                sortStage = { $sort: { createdAt: -1 } };
        }
        pipeline.push(sortStage);

       
        pipeline.push({
            $group: {
                _id: "$_id",
                doc: { $first: "$$ROOT" },
                totalStock: { $sum: "$variants.varientquatity" }
            }
        });
        pipeline.push({ $replaceRoot: { newRoot: { $mergeObjects: ["$doc", { totalStock: "$totalStock" }] } } });

       
        const countPipeline = [...pipeline];
        countPipeline.push({ $count: "total" });
        const countResult = await Product.aggregate(countPipeline);
        const count = countResult.length > 0 ? countResult[0].total : 0;

        
        const totalPages = Math.ceil(count / limit);
        const safePage = Math.min(page, totalPages || 1);
        pipeline.push({ $skip: (safePage - 1) * limit });
        pipeline.push({ $limit: limit });

        
        pipeline.push({
            $lookup: {
                from: "categories",
                localField: "categoryId",
                foreignField: "_id",
                as: "categoryId"
            }
        });
        pipeline.push({
            $unwind: {
                path: "$categoryId",
                preserveNullAndEmptyArrays: true
            }
        });

        
        const productData = await Product.aggregate(pipeline);

        const categoryList = await Category.find({ isListed: true });
        if (!categoryList.length) {
            return res.status(404).render("page-404");
        }

        const formattedProductData = productData.map(product => {
            const firstVariant = product.variants[0] || {};
            return {
                ...product,
                salePrice: firstVariant.salePrice || 0,
                varientquatity: product.totalStock || 0 
            };
        });

        let message = "";
        if (!formattedProductData.length) {
            message = search
                ? `Sorry, no products found for "${search}"`
                : "Sorry, no products are available";
        }

        res.render("prodectManagment", {
            search: search || "",
            categoryFilter: category || "",
            brandFilter: "", 
            data: formattedProductData,
            currentPage: safePage,
            totalPage: totalPages,
            cat: categoryList,
            sales: formattedProductData[0]?.salePrice || 0,
            stock: formattedProductData[0]?.varientquatity || 0,
            message
        });
    } catch (error) {
        console.error("Error filtering products:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};
module.exports = {
    ProductManagement,
    getaddproduct,
    addproduct,
    geteditProduct,
    editProduct,
    deleteImage,
    deleteProduct,
    UnlistProduct,
    listProduct,
    filterProduct
};