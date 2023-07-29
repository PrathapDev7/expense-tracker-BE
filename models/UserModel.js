const mongoose = require('mongoose');

    const userSchema = new mongoose.Schema({
        email: {
            type: String,
            required: true,
            unique: true
        },
        username: {
            type: String,
            required: true
        },
        otp: {
            type: Number
        },
        password: {
            type: String,
            required: true
        },
        verified: {
            type: Boolean,
            default: false
        }
    }, {timestamps: true});

module.exports = mongoose.model('User', userSchema);
