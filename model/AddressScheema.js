const mongoose = require('mongoose');
const { Schema } = mongoose;

const addressSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fullname: {
        type: String,
        required: true,
        minlength: 2,
        maxlength: 50
    },
    mobile: {
        type: String,
        required: true
    },
    address: {
        type: String,
        required: true
    },
    district: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    pincode: {
        type: String,
        required: true
    },
    landmark: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['Home', 'Office', 'Other'],
        default: 'Home'
    }
}, { timestamps: true });

const Address = mongoose.model("Address", addressSchema);

module.exports = Address;