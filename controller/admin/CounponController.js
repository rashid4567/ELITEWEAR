const Coupon = require("../../model/couponScheema");

const createCoupon = async (req, res) => {
    try {
        const { coupencode, couponpercent, minimumPurchase, startingDate, expiryDate, description, limit, maxRedeemable } = req.body;

        if (!coupencode || !couponpercent || !startingDate || !expiryDate) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const existingCoupon = await Coupon.findOne({ coupencode });
        if (existingCoupon) {
            return res.status(400).json({ success: false, message: "Coupon code already exists" });
        }

        const newCoupon = new Coupon({
            coupencode,
            couponpercent,
            minimumPurchase: minimumPurchase || 0,
            startingDate,
            expiryDate,
            description: description || "",
            limit: limit || 1,
            maxRedeemable: maxRedeemable || 0,
            isActive: true
        });

        await newCoupon.save();
        res.status(201).json({ success: true, message: "Coupon created successfully" });
    } catch (error) {
        console.error("Unable to create the coupon:", error);
        res.status(500).json({ success: false, message: "Server issue" });
    }
};

const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find();
        res.status(200).json({ success: true, data: coupons });
    } catch (error) {
        console.error("Error on loading the coupons:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

      
        console.log('Received update data:', updateData);

        
        if (!updateData.coupencode || !updateData.couponpercent || !updateData.startingDate || !updateData.expiryDate) {
            return res.status(400).json({ success: false, message: "Missing required fields: coupencode, couponpercent, startingDate, and expiryDate are required" });
        }

        
        if (updateData.coupencode) {
            const existingCoupon = await Coupon.findOne({ coupencode: updateData.coupencode, _id: { $ne: id } });
            if (existingCoupon) {
                return res.status(400).json({ success: false, message: "Coupon code already exists" });
            }
        }

      
        const startDate = new Date(updateData.startingDate);
        const endDate = new Date(updateData.expiryDate);
        if (isNaN(startDate) || isNaN(endDate)) {
            return res.status(400).json({ success: false, message: "Invalid date format" });
        }
        if (endDate <= startDate) {
            return res.status(400).json({ success: false, message: "Expiry date must be after start date" });
        }


        const updatedCoupon = await Coupon.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: false } 
        );

        if (!updatedCoupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

     
        const tempCoupon = new Coupon(updatedCoupon.toObject());
        await tempCoupon.validate();

        res.status(200).json({ success: true, message: "Coupon updated successfully", data: updatedCoupon });
    } catch (error) {
        console.error("Unable to edit the coupon:", error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Coupon code already exists" });
        }
        res.status(500).json({ success: false, message: "Server issue" });
    }
};

const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        res.status(200).json({ success: true, message: "Coupon status toggled", isActive: coupon.isActive });
    } catch (error) {
        console.error("Unable to toggle the coupon:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCoupon = await Coupon.findByIdAndDelete(id);
        if (!deletedCoupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        res.status(200).json({ success: true, message: "Coupon deleted successfully" });
    } catch (error) {
        console.error("Unable to delete the coupon:", error);
        res.status(500).json({ success: false, message: "Server issue" });
    }
};

const getCouponById = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }
        res.status(200).json({ success: true, data: coupon });
    } catch (error) {
        console.error("Error fetching coupon:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const renderCouponsPage = async (req, res) => {
    try {
        res.render('coupons', { title: 'Coupon Management' });
    } catch (error) {
        console.error("Error rendering coupons page:", error);
        res.status(500).send("Server error");
    }
};

const renderAddCouponPage = async (req, res) => {
    try {
        res.render('addCoupons', { title: 'Add Coupon' });
    } catch (error) {
        console.error("Error rendering add coupon page:", error);
        res.status(500).send("Server error");
    }
};

const renderEditCouponPage = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).send("Coupon not found");
        }
        res.render('editCoupons', { title: 'Edit Coupon', coupon });
    } catch (error) {
        console.error("Error rendering edit coupon page:", error);
        res.status(500).send("Server error");
    }
};

module.exports = {
    createCoupon,
    getAllCoupons,
    getCouponById,
    editCoupon,
    toggleCouponStatus,
    deleteCoupon,
    renderCouponsPage,
    renderAddCouponPage,
    renderEditCouponPage
};


