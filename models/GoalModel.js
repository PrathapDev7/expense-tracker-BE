const mongoose = require('mongoose');

const GoalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxLength: 60,
    },
    targetAmount: {
        type: Number,
        required: true,
    },
    savedAmount: {
        type: Number,
        default: 0,
    },
    targetDate: {
        type: String,
        trim: true,
    },
    icon: {
        type: String,
        trim: true,
    },
    color: {
        type: String,
        trim: true,
    },
    note: {
        type: String,
        trim: true,
        maxLength: 200,
    },
    completed: {
        type: Boolean,
        default: false,
    },
    archived: {
        type: Boolean,
        default: false,
    },
    contributions: [
        {
            amount: {type: Number, required: true},
            date: {type: String, trim: true},
            note: {type: String, trim: true},
        },
    ],
}, {timestamps: true});

module.exports = mongoose.model('Goal', GoalSchema);
