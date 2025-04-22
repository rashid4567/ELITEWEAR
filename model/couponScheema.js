const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    coupencode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    couponpercent: {
        type: Number,
        required: true,
        min: 1,
        max: 100
    },
    minimumPurchase: {
        type: Number,
        default: 0,
        min: 0
    },
    startingDate: {
        type: Date,
        required: true
    },
    expiryDate: {
        type: Date,
        required: true
    },
    description: {
        type: String,
        trim: true
    },
    limit: {
        type: Number,
        default: 1,
        min: 1
    },
    maxRedeemable: {
        type: Number,
        default: 0,
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        usedCount: {
            type: Number,
            default: 1,
        },
    }],
}, {
    timestamps: true
});


couponSchema.pre('findOneAndUpdate', async function (next) {
    const update = this.getUpdate();
    const startDate = update.$set?.startingDate || (await this.model('Coupon').findById(this.getQuery()._id)).startingDate;
    const expiryDate = update.$set?.expiryDate;

    if (startDate && expiryDate) {
        if (new Date(expiryDate) <= new Date(startDate)) {
            return next(new Error('Expiry date must be after start date'));
        }
    }
    next();
});

module.exports = mongoose.model('Coupon', couponSchema);