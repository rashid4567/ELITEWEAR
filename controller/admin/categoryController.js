const Category = require("../../model/categoryScheema");
<<<<<<< Updated upstream

const categoryInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
=======
const Product = require("../../model/productScheema");
const {
  calculateEffectiveDiscount,
  applyDiscountToVariant,
} = require("../../utils/offerUtils");

const categoryInfo = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
>>>>>>> Stashed changes

        const categoryData = await Category.find({})
            .sort({ addedDate: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategory = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategory / limit);

        res.render('category', {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategory: totalCategory
        });

    } catch (error) {
        console.error("Error fetching category data:", error);
        res.status(500).redirect("/pageerror");
    }
};

const addCategory = async (req, res) => {
<<<<<<< Updated upstream
    try {
        const { name, description, stock = 0 } = req.body;
=======
  try {
    const {
      name,
      description,
      stock = 0,
      offer = 0,
      maxRedeemable = 0,
    } = req.body;
>>>>>>> Stashed changes


        if (!name || !description) {
            return res.status(400).json({
                success: false,
                message: "Category name and description are required"
            });
        }


        const trimmedName = name.trim().toLowerCase();


        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
        });

        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: "Category already exists"
            });
        }


        const newCategory = new Category({
            name: trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1),
            description: description.trim(),
            stock: stock,
            offer: 0,
            sales: 0
        });


        await newCategory.save();

        res.status(201).json({
            success: true,
            message: "Category added successfully"
        });

    } catch (error) {
        console.error("Error adding category:", error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
<<<<<<< Updated upstream
=======

    const trimmedName = name.trim().toLowerCase();

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
      stock: Number.parseInt(stock) || 0,
      offer: Number.parseFloat(offer) || 0,
      maxRedeemable: Number.parseFloat(maxRedeemable) || 0,
      sales: 0,
    });

    await newCategory.save();

    // If there's an offer, apply it to all products in this category
    if (Number.parseFloat(offer) > 0) {
      await updateProductsWithCategoryOffer(
        newCategory._id,
        Number.parseFloat(offer),
        Number.parseFloat(maxRedeemable)
      );
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
>>>>>>> Stashed changes
};

const toggleCategory = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Category ID is required"
            });
        }

        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }


        category.isListed = !category.isListed;
        await category.save();

        res.json({
            success: true,
            message: `Category ${category.isListed ? 'listed' : 'unlisted'} successfully`,
            isListed: category.isListed
        });

    } catch (error) {
        console.error("Error toggling category:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Category ID is required"
            });
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        await Category.findByIdAndDelete(id);

        res.json({
            success: true,
            message: "Category deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
<<<<<<< Updated upstream
=======

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if there are products in this category
    const productsCount = await Product.countDocuments({ categoryId: id });
    if (productsCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete category with associated products. Please move or delete the products first.",
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
>>>>>>> Stashed changes
};

const geteditCategory = async (req, res) => {
    try {
        const id = req.query.id;

        if (!id) {
            return res.redirect("/pageerror");
        }

        const category = await Category.findById(id);

        if (!category) {
            return res.redirect("/pageerror");
        }

        res.render("editCategory", { category });
    } catch (error) {
        console.error("Error fetching category:", error);
        res.redirect("/pageerror");
    }
};

// Helper function to update products with category offer
const updateProductsWithCategoryOffer = async (
  categoryId,
  offerValue,
  maxRedeemable = 0
) => {
  try {
    // Find all products in this category
    const products = await Product.find({ categoryId: categoryId });

    for (const product of products) {
      // Determine which offer is higher - product offer or category offer
      const { discount: effectiveDiscount, source: discountSource } =
        calculateEffectiveDiscount(product.offer, offerValue);

      // Update the product with the effective discount
      product.effectiveDiscount = effectiveDiscount;
      product.discountSource = discountSource;

      // Update the sale price for each variant
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

<<<<<<< Updated upstream
        if (!id) {
            return res.status(400).json({ error: "Missing category ID" });
        }

        const { name, description, offer } = req.body;
        const trimmedName = name.trim();
        const trimmedDescription = description.trim();
        const offerValue = Number(offer);


        const existingCategory = await Category.findOne({
            name: trimmedName,
            _id: { $ne: id }
        });

        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }


        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            { $set: { name: trimmedName, description: trimmedDescription, offer: offerValue } },
            { new: true }
        );

        if (!updatedCategory) {
            return res.status(404).json({ error: "Category not found" });
        }

        res.redirect("/admin/categories");

    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};

module.exports = {
    categoryInfo,
    addCategory,
    toggleCategory,
    geteditCategory,
    editCategory,
    deleteCategory
};
=======
    const { name, description, offer, stock, maxRedeemable } = req.body;
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const offerValue = Number.parseFloat(offer) || 0;
    const stockValue = Number.parseInt(stock) || 0;
    const maxRedeemableValue = Number.parseFloat(maxRedeemable) || 0;

    if (offerValue < 0 || offerValue > 100) {
      return res
        .status(400)
        .json({ error: "Offer must be between 0 and 100%" });
    }

    if (stockValue < 0) {
      return res.status(400).json({ error: "Stock cannot be negative" });
    }

    if (maxRedeemableValue < 0) {
      return res
        .status(400)
        .json({ error: "Max redeemable amount cannot be negative" });
    }

    const existingCategory = await Category.findOne({
      name: trimmedName,
      _id: { $ne: id },
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    // Get the old category to check if offer has changed
    const oldCategory = await Category.findById(id);
    const offerChanged =
      oldCategory.offer !== offerValue ||
      oldCategory.maxRedeemable !== maxRedeemableValue;

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        $set: {
          name: trimmedName,
          description: trimmedDescription,
          offer: offerValue,
          stock: stockValue,
          maxRedeemable: maxRedeemableValue,
        },
      },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    // If offer has changed, update all products in this category
    if (offerChanged) {
      await updateProductsWithCategoryOffer(id, offerValue, maxRedeemableValue);
    }

    res.redirect("/admin/categories");
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};

module.exports = {
  categoryInfo,
  addCategory,
  toggleCategory,
  geteditCategory,
  editCategory,
  deleteCategory,
  updateProductsWithCategoryOffer,
};
>>>>>>> Stashed changes
