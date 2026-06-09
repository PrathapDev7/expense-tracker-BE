const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxLength: 40,
    },
    kind: {
        type: String,
        enum: ['cash', 'bank', 'card', 'wallet'],
        default: 'cash',
    },
    openingBalance: {
        type: Number,
        default: 0,
    },
    icon: {
        type: String,
        trim: true,
    },
    color: {
        type: String,
        trim: true,
    },
    provider: {
        type: String,
        trim: true,
    },
    providerName: {
        type: String,
        trim: true,
    },
    cardType: {
        type: String,
        enum: ['', 'credit', 'debit'],
        default: '',
    },
    last4: {
        type: String,
        trim: true,
        maxLength: 4,
    },
    holderName: {
        type: String,
        trim: true,
        maxLength: 60,
    },
    reminderDay: {
        type: Number,
        min: 1,
        max: 31,
    },
    expiry: {
        type: String,
        trim: true,
        maxLength: 5,
    },
    archived: {
        type: Boolean,
        default: false,
    },
}, {timestamps: true});

module.exports = mongoose.model('Wallet', WalletSchema);
