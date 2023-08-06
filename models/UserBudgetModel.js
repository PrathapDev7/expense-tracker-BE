const mongoose = require('mongoose');

const userBudgetSchema = new mongoose.Schema({
    user: {
        type: String,
        required: true,
        unique: true
    },
    budgets: {
        type: Object,
        required: true
    }
}, {timestamps: true});

module.exports = mongoose.model('UserBudget', userBudgetSchema);
