const mongoose = require('mongoose');

const RecurringSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    kind: {
        type: String,
        enum: ['expense', 'income'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    category: {
        type: String,
        required: true,
        trim: true,
    },
    sub_category: {
        type: String,
        trim: true,
    },
    title: {
        type: String,
        trim: true,
        maxLength: 50,
    },
    description: {
        type: String,
        maxLength: 100,
        trim: true,
    },
    type: {
        type: String,
        trim: true,
    },
    account: {
        type: String,
        trim: true,
    },
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly'],
        required: true,
    },
    interval: {
        type: Number,
        default: 1,
        min: 1,
    },
    startDate: {
        type: String,
        required: true,
        trim: true,
    },
    nextRunDate: {
        type: String,
        required: true,
        trim: true,
    },
    endDate: {
        type: String,
        trim: true,
    },
    lastRunDate: {
        type: String,
        trim: true,
    },
    active: {
        type: Boolean,
        default: true,
    },
}, {timestamps: true});

RecurringSchema.index({user: 1, active: 1, nextRunDate: 1});

module.exports = mongoose.model('Recurring', RecurringSchema);
