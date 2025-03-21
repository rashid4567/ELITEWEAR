const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSChema = new Schema({
    name: {
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
        unique: true,
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
    }
}, { timestamps: true });  
const User = mongoose.model("User", userSChema);

module.exports = User;
