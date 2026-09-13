const mongoose = require('mongoose');

const userPreferenceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    currencySymbol: {
        type: String,
        default: '₹'
    },
    currencyCode: {
        type: String,
        default: 'INR'
    },
    defaultTxnType: {
        type: String,
        enum: ['expense', 'income'],
        default: 'expense'
    },
    defaultCategory: {
        type: String,
        default: null
    },
    defaultWallet: {
        type: String,
        default: null
    },
    weekStart: {
        type: String,
        enum: ['monday', 'sunday'],
        default: 'monday'
    },
    theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system'
    },
    pushTokens: {
        type: [String],
        default: [],
    },
}, {timestamps: true});

module.exports = mongoose.model('UserPreference', userPreferenceSchema);
