const mongoose = require('mongoose');

    const userSchema = new mongoose.Schema({
        mobile: {
            type: String,
            required: true,
            unique: true
        },
        username: {
            type: String,
            required: true
        },
        email: {
            type: String,
            unique: true,
            sparse: true
        },
        password: {
            type: String,
            required: true
        },
    }, {timestamps: true});

module.exports = mongoose.model('User', userSchema);
