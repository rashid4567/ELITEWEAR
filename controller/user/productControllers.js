const Product = require("../../model/productScheema");
const User = require("../../model/userSchema");
const Category = require("../../model/categoryScheema");

const productdetails = async (req, res) => {
  try {
    const productId = req.params.id || req.query.id;
    if (!productId) {
      return res.redirect("/");
    }
    const product = await Product.findById(productId)
      .populate("categoryId")
      .lean();
    if (!product) {
      return res.redirect("/page-not-found");
    }
    const findCategory = product.categoryId;
    const categoryOffer = findCategory?.offer || 0;
    const productOffer = product.offer || 0;
    const totalOffer = categoryOffer + productOffer;
    const quantity =
      product.variants && product.variants.length > 0
        ? product.variants.reduce(
            (acc, variant) => acc + (variant.varientquatity || 0),
            0
          )
        : 0;
    const similarProducts = await Product.find({
      categoryId: product.categoryId._id,
      _id: { $ne: product._id },
      isActive: true,
    })
      .limit(4)
      .lean();
    res.render("productdetails", {
      user: req.session.user ? await User.findById(req.session.user) : null,
      product: product,
      quantity: quantity,
      totalOffer: totalOffer,
      category: findCategory,
      similarProducts: similarProducts,
    });
  } catch (error) {
    console.error("Error in productdetails:", error);
    return res.redirect("/page-not-found");
  }
};

module.exports = {
  productdetails,
};
