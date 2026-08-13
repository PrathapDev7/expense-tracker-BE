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
        calorieGoals: {
            calorieTarget: { type: Number, default: 2000 },
            carbTarget: { type: Number, default: 200 },
            fatTarget: { type: Number, default: 80 },
            proteinTarget: { type: Number, default: 100 },
        }
    }, {timestamps: true});

module.exports = mongoose.model('User', userSchema);
