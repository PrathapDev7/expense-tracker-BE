const UserBudgetSchema = require("../models/UserBudgetModel");
const UserSchema = require('../models/UserModel');
const moment = require('moment');

exports.getAllUsers = async (req, res) => {
    const { page } = req.query;
    const perPage = 10;
    const skip = (page - 1) * perPage;

    try {
        const users = await UserSchema.find().skip(skip).limit(perPage);
        res.status(200).json({response: users});
    } catch (err) {
        throw new Error('Error fetching users');
    }
};

exports.addUserBudget = async (req, res) => {
    const {budgets}  = req.body;

    const userBudget = UserBudgetSchema({
        budgets : budgets,
        user: req.user.id,
    });

    try {
        await userBudget.save();
        res.status(200).json({message: 'Budget Added'})
    } catch (error) {
        res.status(500).json({message: 'Server Error', error})
    }
};

exports.updateUserBudget = async (req, res) => {
    const { budgets } = req.body;
    const budgetId = req.params.id; // Assuming the expense ID is passed as a route parameter

    try {
        // Check if the expense exists in the database
        const budget = await UserBudgetSchema.findById(budgetId);
        if (!budget) {
            return res.status(404).json({ message: 'budget not found' });
        }

        budget.budgets = budgets;

        // Save the updated expense to the database
        await budget.save();

        res.status(200).json({ message: 'Budget updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getUserBudget = async (req, res) => {
    try {
        const query = { user: req.user.id };

        const budgets = await UserBudgetSchema.findOne(query).sort({ createdAt: -1 });
        res.status(200).json({response: budgets});
    } catch (error) {
        res.status(500).json({ message: error });
    }
};
