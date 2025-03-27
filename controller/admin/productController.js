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
                { name: { $regex: new RegExp(search, "i") } },
                { brand: { $regex: new RegExp(search, "i") } }
            ]
        });

        const productData = await Product.find({
            $or: [
                { name: { $regex: new RegExp(search, "i") } },
                { brand: { $regex: new RegExp(search, "i") } }
            ]
        })
        .limit(limit)
        .skip((page - 1) * limit)
        .populate("categoryId")
        .exec();

        const category = await Category.find({ isListed: true });

        if (category.length > 0) {
         
            const formattedProductData = productData.map(product => {
                const firstVariant = product.variants[0] || {}; 
                return {
                    ...product.toObject(),
                    salePrice: firstVariant.salePrice || 0,
                    quantity: firstVariant.quantity || 0     
                };
            });

            res.render("prodectManagment", {
                data: formattedProductData,
                currentPage: page,
                totalPage: Math.ceil(count / limit),
                cat: category,
                sales: formattedProductData[0]?.salePrice || 0, // Example for first product
                stock: formattedProductData[0]?.quantity || 0   // Example for first product
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
        console.log('Incoming files:', req.files);

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

        const requiredFields = ['productName', 'productPrice', 'productDescription', 'productCategory', 'totalStockQuantity'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            return res.status(400).render("addproduct", {
                error: `Missing required fields: ${missingFields.join(', ')}`,
                categories: await Category.find({ isListed: true }),
            });
        }

        const images = [];
        if (req.files) {
            if (req.files.mainImage) {
                images.push({
                    url: req.files.mainImage[0].path, // Cloudinary URL
                    thumbnail: req.files.mainImage[0].path,
                    isMain: true
                });
            }
            for (let i = 1; i <= 3; i++) {
                const fieldName = `additionalImage${i}`;
                if (req.files[fieldName]) {
                    images.push({
                        url: req.files[fieldName][0].path, // Cloudinary URL
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

        const categoryData = await Category.findOne({ _id: productCategory });
        if (!categoryData) {
            return res.status(400).render("addproduct", {
                error: "Invalid category",
                categories: await Category.find({ isListed: true }),
            });
        }

        const regularPrice = parseFloat(productPrice);
        const offer = parseFloat(productOffer || 0);
        const salePrice = regularPrice * (1 - offer / 100);

        const variants = Array.isArray(sizes)
            ? sizes.map(size => ({
                  size,
                  regularPrice,
                  salePrice,
                  quantity: Math.floor(parseInt(totalStockQuantity) / sizes.length)
              }))
            : [{
                  size: sizes,
                  regularPrice,
                  salePrice,
                  quantity: parseInt(totalStockQuantity)
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

        const data = req.body;
        const existProduct = await Product.findOne({
            name: data.productName,
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
        if (req.files && Object.keys(req.files).length > 0) {
            console.log("Files uploaded to Cloudinary:", req.files);

            if (req.files.mainImage) {
              
                images = images.filter(img => !img.isMain);
                images.push({
                    url: req.files.mainImage[0].path,
                    thumbnail: req.files.mainImage[0].path,
                    isMain: true
                });
            }
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

        const regularPrice = parseFloat(data.productPrice);
        const offer = parseFloat(data.productOffer || 0);
        const salePrice = regularPrice * (1 - offer / 100);

        const updateFields = {
            name: data.productName,
            description: data.productDescription,
            brand: data.brand || undefined,
            categoryId: data.productCategory,
            offer: offer,
            sku: data.sku || undefined,
            images, 
            variants: Array.isArray(data.sizes) 
                ? data.sizes.map(size => ({
                      size,
                      regularPrice,
                      salePrice,
                      quantity: Math.floor(parseInt(data.totalStockQuantity) / data.sizes.length)
                  }))
                : [{
                      size: data.sizes,
                      regularPrice,
                      salePrice,
                      quantity: parseInt(data.totalStockQuantity)
                  }]
        };

        const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, { new: true });
        console.log("Updated product images:", updatedProduct.images);
        res.redirect("/admin/productManagment");
    } catch (error) {
        console.error("Error editing product:", error);
        res.status(500).render("editProduct", {
            error: "Failed to edit product: " + error.message,
            product: await Product.findById(req.params.id),
            categories: await Category.find({ isListed: true })
        });
    }
};
const deleteImage = async (req, res) => {
    try {
        const { imageToserver, productToserver } = req.body; // Match the frontend
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
module.exports = {
  
    ProductManagement,
    getaddproduct,
    addproduct,
    geteditProduct,
    editProduct,
    deleteImage
    
};
