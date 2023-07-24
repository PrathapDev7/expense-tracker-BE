const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        required: true,
        enum: ['income', 'expense']
    }
},{timestamps: true});

module.exports = mongoose.model('Category', categorySchema);
