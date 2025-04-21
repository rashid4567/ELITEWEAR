const Coupon = require("../../model/couponScheema")

const getcoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        const coupons = await Coupon.find({
            isActive: true,
            expiryDate: { $gt: new Date() }, 
            $or: [
                { limit: { $gt: 0 } }, 
                { limit: { $exists: false } } 
            ]
        });

        res.render('userCoupon', { 
            title: 'Elite Wear - My Coupons', 
            coupons: coupons 
        });
    } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).send("Server error");
    }
};

const applyCoupon = async (req,res)=>{
    try {
        const  {userId, code ,  cartTotal} = req.body;
        if(!userId || !code || cartTotal === undefined){
            return res.status(400).json({success: false, message:"missing required field"})
        }
        const coupon = await coupon.findOne({ couponcode : code , isActive : true, expiryDate : {$gt : new Date() } })
        if(!coupon){
            return res.status(404).json({success : false, messsage: " Invalid or expired coupon"})
        }

        if (coupon.minimumPurchase && cartTotal < coupon.minimumPurchase){
            res.status(400).json({success: false, message:`Minimum purchase of ₹${coupon.minimumPurchase} required`})
        }
        const discount =(cartTotal * coupon.couponpercent)/100;
        const maxCount = coupon.maxRedeemable || Infinity;
        const finalDiscount =  Math.min(discount, maxDiscount)
        res.status(200).json({
            success: true,
            message : 'Coupon applied successfully',
            discount: finalDiscount,
            coupon,
        })
    } catch (error) {
        console.error("unable to applie the coupon")
        res.status(500).json({success: false, message: 'server error'})
    }
}
module.exports = {
    getcoupon,
    applyCoupon
}