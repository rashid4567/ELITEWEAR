const mongoose = require('mongoose');
const { Schema } = mongoose;
const crypto = require('crypto');

const userSchema = new Schema({
    fullname: {
        type: String, 
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    mobile: {
        type: String,
        required: false,
        unique: false,
        sparse: true,  
        default: null,
    },
    googleId: {
        type: String,
        default: null,
        index: true,   
    },
    password: {
        type: String,
        required: false,
    },
    isBlocked: {
        type: Boolean,
        default: false,
    },
    isAdmin: {
        type: Boolean,
        default: false,
    },
    referralCode: {
        type: String,
        unique: true,
        default: () => {
            return crypto.randomBytes(4).toString('hex').toUpperCase();
        }
    },
    referredBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, { timestamps: true });  

module.exports = mongoose.models.User || mongoose.model('User', userSchema);