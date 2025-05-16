const Category = require("../../model/categoryScheema");
const Product = require("../../model/productScheema");

const categoryInfo = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 4;
    const skip = (page - 1) * limit;

    const categoryData = await Category.find({})
      .sort({ addedDate: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategory = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategory / limit);

    res.render("category", {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategory: totalCategory,
      limit: limit,
    });
  } catch (error) {
    console.error("Error fetching category data:", error);
    res.status(500).redirect("/notfound");
  }
};

const addCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      stock = 0,
      offer = 0,
      maxRedeemable = 0,
    } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: "Category name and description are required",
      });
    }

    const trimmedName = name.trim();

    if (trimmedName.includes(" ")) {
      return res.status(400).json({
        success: false,
        message: "Category name cannot contain spaces",
      });
    }

    if (/\d/.test(trimmedName)) {
      return res.status(400).json({
        success: false,
        message: "Category name cannot contain numbers",
      });
    }

    if (description.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: `Description must be at least 20 characters (currently ${
          description.trim().length
        })`,
      });
    }

    const offerValue = Number(offer);
    if (isNaN(offerValue) || offerValue < 0 || offerValue > 100) {
      return res.status(400).json({
        success: false,
        message: "Offer must be between 0 and 100%",
      });
    }

    const maxRedeemableValue = Number(maxRedeemable);
    if (isNaN(maxRedeemableValue) || maxRedeemableValue < 0) {
      return res.status(400).json({
        success: false,
        message: "Max redeemable amount cannot be negative",
      });
    }

    if (maxRedeemableValue > 500000) {
      return res.status(400).json({
        success: false,
        message: "Max redeemable amount cannot exceed ₹500,000",
      });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category already exists",
      });
    }

    const newCategory = new Category({
      name: trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1),
      description: description.trim(),
      stock: Number(stock),
      offer: offerValue,
      maxRedeemable: maxRedeemableValue,
      sales: 0,
      addedDate: new Date(),
      isListed: true,
    });

    await newCategory.save();

    if (offerValue > 0) {
      await applyCategoryOffer(newCategory._id);
    }

    res.status(201).json({
      success: true,
      message: "Category added successfully",
    });
  } catch (error) {
    console.error("Error adding category:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const toggleCategory = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required",
      });
    }

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    category.isListed = !category.isListed;
    await category.save();

    res.json({
      success: true,
      message: `Category ${
        category.isListed ? "listed" : "unlisted"
      } successfully`,
      isListed: category.isListed,
    });
  } catch (error) {
    console.error("Error toggling category:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required",
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await Category.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const geteditCategory = async (req, res) => {
  try {
    const id = req.query.id;

    if (!id) {
      return res.redirect("/notfound");
    }

    const category = await Category.findById(id);

    if (!category) {
      return res.redirect("/notfound");
    }

    res.render("editCategory", { category });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.redirect("/notfound");
  }
};

const updateProductsWithCategoryOffer = async (
  categoryId,
  offerValue,
  maxRedeemable = 0
) => {
  try {
    const products = await Product.find({ categoryId: categoryId });

    for (const product of products) {
      const { discount: effectiveDiscount, source: discountSource } =
        calculateEffectiveDiscount(product.offer, offerValue);

      product.effectiveDiscount = effectiveDiscount;
      product.discountSource = discountSource;

      product.variants = product.variants.map((variant) => {
        return applyDiscountToVariant(
          variant,
          effectiveDiscount,
          maxRedeemable
        );
      });

      await product.save();
    }

    console.log(
      `Updated ${products.length} products with category offer: ${offerValue}%`
    );
  } catch (error) {
    console.error("Error updating products with category offer:", error);
    throw error;
  }
};

const editCategory = async (req, res) => {
  try {
    const id = req.body.id;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Missing category ID" });
    }

    const {
      name,
      description,
      stock = 0,
      offer = 0,
      maxRedeemable = 0,
    } = req.body;
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const offerValue = Number(offer) || 0;
    const maxRedeemableValue = Number(maxRedeemable) || 0;
    const stockValue = Number(stock) || 0;

    // Validate inputs
    if (!trimmedName) {
      return res
        .status(400)
        .json({ success: false, message: "Category name is required" });
    }

    if (trimmedName.includes(" ")) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Category name cannot contain spaces",
        });
    }

    if (/\d/.test(trimmedName)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Category name cannot contain numbers",
        });
    }

    if (trimmedDescription.length < 20) {
      return res.status(400).json({
        success: false,
        message: `Description must be at least 20 characters (currently ${trimmedDescription.length})`,
      });
    }

    if (offerValue < 0 || offerValue > 100) {
      return res
        .status(400)
        .json({ success: false, message: "Offer must be between 0 and 100%" });
    }

    if (maxRedeemableValue < 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Max redeemable amount cannot be negative",
        });
    }

    if (maxRedeemableValue > 500000) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Max redeemable cannot exceed ₹500,000",
        });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      _id: { $ne: id },
    });

    if (existingCategory) {
      return res
        .status(400)
        .json({ success: false, message: "Category already exists" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        $set: {
          name: trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1),
          description: trimmedDescription,
          stock: stockValue,
          offer: offerValue,
          maxRedeemable: maxRedeemableValue,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedCategory) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    await updateProductsWithCategoryOffer(id, offerValue, maxRedeemableValue);

    res.redirect("/admin/categories");
  } catch (error) {
    console.error("Error updating category:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const applyCategoryOffer = async (categoryId) => {
  try {
    const category = await Category.findById(categoryId);
    if (!category || !category.offer) return;

    const products = await Product.find({ categoryId: categoryId });

    for (const product of products) {
      if (category.offer > 0) {
        await Product.findByIdAndUpdate(product._id, {
          $set: {
            categoryDiscount: category.offer,
          },
        });
      }
    }
  } catch (error) {
    console.error("Error applying category offer:", error);
  }
};

const checkCategoryNameExists = async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const trimmedName = name.trim();
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      _id: { $ne: req.query.id },
    });

    return res.json({ exists: !!existingCategory });
  } catch (error) {
    console.error("Error checking category name:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const calculateEffectiveDiscount = (productOffer, categoryOffer) => {
  if (productOffer >= categoryOffer) {
    return { discount: productOffer, source: "product" };
  } else {
    return { discount: categoryOffer, source: "category" };
  }
};

const applyDiscountToVariant = (variant, discount, maxRedeemable) => {
  const originalPrice = variant.price;
  let discountAmount = (originalPrice * discount) / 100;

  if (maxRedeemable > 0 && discountAmount > maxRedeemable) {
    discountAmount = maxRedeemable;
  }

  variant.salePrice = originalPrice - discountAmount;
  return variant;
};

module.exports = {
  categoryInfo,
  addCategory,
  toggleCategory,
  geteditCategory,
  editCategory,
  deleteCategory,
  checkCategoryNameExists,
};
