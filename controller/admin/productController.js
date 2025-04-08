const Product = require("../../model/productScheema");
const Category = require("../../model/categoryScheema");
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const sharp = require("sharp");
const { count } = require("console");
const { unlink } = require("fs");
const cloudinary = require('cloudinary').v2;


const ProductManagement = async (req, res) => {
    try {
        const search = req.query.search || "";
        const categoryFilter = req.query.category || "";
        const brandFilter = req.query.brand || "";
        const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : "";
        const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : "";
        const sort = req.query.sort || "";
        const page = Math.max(parseInt(req.query.page) || 1, 1); 
        const limit = 6;

        let query = { $and: [] };

        if (search) {
            query.$and.push({
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { brand: { $regex: search, $options: "i" } }
                ]
            });
        } else {
            query.$and.push({});
        }


        if (categoryFilter && categoryFilter !== "all") {
            const categoryData = await Category.findOne({ name: categoryFilter }).catch(err => {
                console.error("Category fetch error:", err);
                return null;
            });
            if (categoryData) {
                query.$and.push({ categoryId: categoryData._id });
            } else {
                console.warn(`Category "${categoryFilter}" not found`);
            }
        }


        if (brandFilter) {
            query.$and.push({ brand: { $regex: brandFilter, $options: "i" } });
        }


        if (minPrice || maxPrice) {
            const priceQuery = {};
            if (minPrice) priceQuery.$gte = minPrice;
            if (maxPrice) priceQuery.$lte = maxPrice;
            query.$and.push({ "variants.salePrice": priceQuery });
        }


        if (query.$and.length === 0) {
            query = {};
        }


        let sortOption = {};
        switch (sort) {
            case "desc":
                sortOption = { "variants.salePrice": -1 };
                break;
            case "asc":
                sortOption = { "variants.salePrice": 1 };
                break;
            case "latest":
                sortOption = { createdAt: -1 };
                break;
            default:
                sortOption = { createdAt: -1 };
        }

  
        const count = await Product.countDocuments(query).catch(err => {
            console.error("Count documents error:", err);
            return 0;
        });
        const totalPages = Math.ceil(count / limit) || 1; 
        const safePage = Math.min(Math.max(page, 1), totalPages);
        const skip = (safePage - 1) * limit;

        
        const productData = await Product.find(query)
            .sort(sortOption)
            .limit(limit)
            .skip(skip)
            .populate("categoryId")
            .catch(err => {
                console.error("Product fetch error:", err);
                return [];
            });

        const category = await Category.find({ isListed: true }).catch(err => {
            console.error("Category list fetch error:", err);
            return [];
        });


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
            minPrice,
            maxPrice,
            sort,
            data: formattedProductData,
            currentPage: safePage,
            totalPage: totalPages,
            cat: category,
            sales: formattedProductData[0]?.salePrice || 0,
            stock: formattedProductData[0]?.varientquatity || 0,
            message: message
        });

    } catch (error) {
        console.error("ProductManagement error:", error);

        res.render("prodectManagment", {
            search: req.query.search || "",
            categoryFilter: req.query.category || "",
            brandFilter: req.query.brand || "",
            minPrice: req.query.minPrice || "",
            maxPrice: req.query.maxPrice || "",
            sort: req.query.sort || "",
            data: [],
            currentPage: 1,
            totalPage: 1,
            cat: [],
            sales: 0,
            stock: 0,
            message: "An error occurred while fetching products. Please try again."
        });
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

        // Validate required fields
        const requiredFields = ['productName', 'productDescription', 'productCategory', 'color', 'fabric'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            console.error('Missing required fields:', missingFields);
            return res.status(400).render("addproduct", {
                error: `Missing required fields: ${missingFields.join(', ')}`,
                categories: await Category.find({ isListed: true })
            });
        }

        // Handle image uploads with duplicate prevention
        const images = [];
        const imageSet = new Set();

        const imageFields = [
            { name: 'mainImage', isMain: true },
            { name: 'additionalImage1', isMain: false },
            { name: 'additionalImage2', isMain: false },
            { name: 'additionalImage3', isMain: false }
        ];

        for (const field of imageFields) {
            if (req.files && req.files[field.name] && req.files[field.name][0]) {
                const imageUrl = req.files[field.name][0].path;
                if (!imageSet.has(imageUrl)) {
                    images.push({
                        url: imageUrl,
                        thumbnail: imageUrl,
                        isMain: field.isMain
                    });
                    imageSet.add(imageUrl);
                }
            }
        }

        if (!images.some(img => img.isMain)) {
            console.error('No main image provided');
            return res.status(400).render("addproduct", {
                error: "Please upload a main product image",
                categories: await Category.find({ isListed: true })
            });
        }

        // Category validation
        const categoryData = await Category.findOne({ name: productCategory });
        if (!categoryData) {
            console.error('Invalid category:', productCategory);
            return res.status(400).render("addproduct", {
                error: "Invalid category",
                categories: await Category.find({ isListed: true })
            });
        }

        // Parse variants
        let parsedVariants = [];
        if (variants) {
            if (Array.isArray(variants)) {
                parsedVariants = variants.map(variant => ({
                    size: variant.size,
                    varientPrice: parseFloat(variant.varientPrice) || 0,
                    salePrice: parseFloat(variant.varientPrice || 0) * (1 - parseFloat(productOffer || 0) / 100),
                    varientquatity: parseInt(variant.varientquatity) || 0
                }));
            } else if (typeof variants === 'object') {
                parsedVariants = Object.values(variants).map(variant => ({
                    size: variant.size,
                    varientPrice: parseFloat(variant.varientPrice) || 0,
                    salePrice: parseFloat(variant.varientPrice || 0) * (1 - parseFloat(productOffer || 0) / 100),
                    varientquatity: parseInt(variant.varientquatity) || 0
                }));
            } else if (req.body['variants[0][size]']) {
                let index = 0;
                while (req.body[`variants[${index}][size]`]) {
                    parsedVariants.push({
                        size: req.body[`variants[${index}][size]`],
                        varientPrice: parseFloat(req.body[`variants[${index}][varientPrice]`]) || 0,
                        salePrice: parseFloat(req.body[`variants[${index}][varientPrice]`] || 0) * 
                                (1 - parseFloat(productOffer || 0) / 100),
                        varientquatity: parseInt(req.body[`variants[${index}][varientquatity]`]) || 0
                    });
                    index++;
                }
            }
        }

        if (parsedVariants.length === 0) {
            console.error('No variants provided');
            return res.status(400).render("addproduct", {
                error: "Please add at least one variant",
                categories: await Category.find({ isListed: true })
            });
        }

        // Create and save new product
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
        console.log('Product saved successfully:', newProduct._id);
        return res.redirect("/admin/productManagment");

    } catch (error) {
        console.error('Product Add Error:', error);
        return res.status(500).render("addproduct", {
            error: "Failed to add product: " + error.message,
            categories: await Category.find({ isListed: true })
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

      
        const cloudinaryDeletePromises = []; 

       
        if (req.files && req.files.mainImage) {
            const oldMainImage = images.find(img => img.isMain);
            if (oldMainImage) {
                const publicId = oldMainImage.url.split('/').pop().split('.')[0];
                cloudinaryDeletePromises.push(
                    cloudinary.uploader.destroy(`banners/${publicId}`)
                );
                images = images.filter(img => !img.isMain); 
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
                const oldImageIndex = images.findIndex(img => !img.isMain && img.url === (images[i]?.url || '')); 
                if (oldImageIndex !== -1) {
                    const oldImage = images[oldImageIndex];
                    const publicId = oldImage.url.split('/').pop().split('.')[0];
                    cloudinaryDeletePromises.push(
                        cloudinary.uploader.destroy(`banners/${publicId}`)
                    );
                    images.splice(oldImageIndex, 1); 
                }
                images.push({
                    url: req.files[fieldName][0].path,
                    thumbnail: req.files[fieldName][0].path,
                    isMain: false
                });
            }
        }

   
        await Promise.all(cloudinaryDeletePromises);

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

module.exports = {
    ProductManagement,
    getaddproduct,
    addproduct,
    geteditProduct,
    editProduct,
    deleteProduct,
    UnlistProduct,
    listProduct,
};