const mongoose = require('mongoose');

const subCategorySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    category: {
        type: String,
        required: true,
        trim: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {timestamps: true});

subCategorySchema.index({title: 1, category: 1, user: 1}, {unique: true});

module.exports = mongoose.model('SubCategory', subCategorySchema);
