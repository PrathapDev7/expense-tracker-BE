const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    type: {
        type: String,
        required: true,
        enum: ['income', 'expense']
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    icon: {
        type: String,
        trim: true,
    },
    color: {
        type: String,
        trim: true,
    },
    archived: {
        type: Boolean,
        default: false,
    },
},{timestamps: true});

// Categories are per-user: a user cannot have two categories with the same
// title within a given type, but different users (and types) can.
categorySchema.index({user: 1, title: 1, type: 1}, {unique: true});

module.exports = mongoose.model('Category', categorySchema);
