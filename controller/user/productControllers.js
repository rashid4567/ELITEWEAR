const Product = require('../../model/productScheema');
const User = require('../../model/userSChema');
const Category = require('../../model/categoryScheema');

const productdetails = async (req, res) => {
    try {
        console.log("Entering productdetails function");
        

        const productId = req.params.id || req.query.id;
        if (!productId) {
            console.log("No product ID provided, redirecting to homepage");
            return res.redirect('/');
        }
        
        console.log("Product ID:", productId);

        const product = await Product.findById(productId).populate('categoryId');
        
        if (!product) {
            console.log("Product not found, redirecting to 404 page");
            return res.redirect('/page-not-found');
        }

  
        const findCategory = product.categoryId;
        const categoryOffer = findCategory?.offer || 0;
        const productOffer = product.offer || 0;
        const totalOffer = categoryOffer + productOffer;

  
        const quantity = product.variants ? 
            product.variants.reduce((acc, variant) => acc + variant.quantity, 0) : 0;
   
        const similarProducts = await Product.find({
            categoryId: product.categoryId._id,
            _id: { $ne: product._id },
            isActive: true
        }).limit(4);

        console.log("Rendering with:", {
            product: product ? "Exists" : "Missing",
            user: req.session.user ? "Logged in" : "Not logged in",
            category: findCategory ? "Exists" : "Missing"
        });

        res.render('productdetails', {
            user: req.session.user ? await User.findById(req.session.user) : null,
            product: product,
            quantity: quantity,
            totalOffer: totalOffer,
            category: findCategory,
            similarProducts: similarProducts
        });
        
    } catch (error) {
        console.error("Error in productdetails:", error);
        return res.redirect('/page-not-found');
    }
};

module.exports = {
    productdetails
};