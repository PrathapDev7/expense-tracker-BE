const mongoose = require('mongoose');

const TransferSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    fromWallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true,
    },
    toWallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01,
    },
    date: {
        type: String,
        required: true,
        trim: true,
    },
    note: {
        type: String,
        maxLength: 100,
        trim: true,
    },
}, {timestamps: true});

TransferSchema.index({user: 1, date: -1});

module.exports = mongoose.model('Transfer', TransferSchema);
