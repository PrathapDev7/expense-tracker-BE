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
    archived: {
        type: Boolean,
        default: false,
    },
}, {timestamps: true});

module.exports = mongoose.model('Wallet', WalletSchema);
