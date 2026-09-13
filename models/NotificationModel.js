const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['bill_due', 'budget_alert', 'recurring_created', 'transfer'],
        required: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    body: {
        type: String,
        trim: true,
    },
    data: {
        type: Object,
        default: {},
    },
    read: {
        type: Boolean,
        default: false,
    },
}, {timestamps: true});

NotificationSchema.index({user: 1, read: 1, createdAt: -1});

module.exports = mongoose.model('Notification', NotificationSchema);
