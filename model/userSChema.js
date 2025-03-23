const mongoose = require('mongoose');
const { Schema } = mongoose;

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
    }
}, { timestamps: true });  

const User = mongoose.model("User", userSchema);

module.exports = User;
