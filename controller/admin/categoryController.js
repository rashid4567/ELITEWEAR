const Category = require("../../model/categoryScheema");

const categoryInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

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
    try {
        const { name, description, stock = 0 } = req.body;


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

const editCategory = async (req, res) => {
    try {

        const id = req.body.id;

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