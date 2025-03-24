const Category = require("../../model/categoryScheema");

const categoryInfo = async (req, res) => { 
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 }) 
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
        console.log("Error fetching category data:", error);
        res.redirect("/pageerror");
    }
};
const addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || !description) {
            return res.status(400).json({ message: "All fields are required" });
        }

        let existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ message: "Category already exists" });
        }

        const newCategory = new Category({ name, description });

        await newCategory.save();
        return res.status(201).json({ message: "Category added successfully" });

    } catch (error) {
        console.error("Unable to add category:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


module.exports = {
    categoryInfo,
    addCategory
};
