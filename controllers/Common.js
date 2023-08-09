const IncomeSchema = require("../models/IncomeModel");
const ExpenseSchema = require("../models/ExpenseModel");
const {combineAndSortByCreatedAt} = require("../Utils");
const UserSchema = require('../models/UserModel');
const moment = require('moment');

exports.baseAction = async (req, res) => {
    try {
        res.status(200).json({data : "success"})
    } catch
        (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.getStats = async (req, res) => {
    try {
        const query = {user: req.user.id};
        let start_date = moment().startOf('month').format("YYYY-MM-DD");
        let end_date = moment().endOf('month').format("YYYY-MM-DD");
        query.date = {$gte: start_date, $lte: end_date};

        const incomes = await IncomeSchema.find(query).sort({createdAt: -1});
        const expenses = await ExpenseSchema.find(query).sort({createdAt: -1});
        res.status(200).json({
            response: {
                allData: combineAndSortByCreatedAt(incomes, expenses) || [],
                total_incomes: !!incomes.length ? incomes.reduce((a, b) => a + b.amount, 0) : 0,
                total_expenses: !!expenses.length ? expenses.reduce((a, b) => a + b.amount, 0) : 0,
            }
        })
    } catch
        (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.getStats = async (req, res) => {
    try {
        const query = {user: req.user.id};
        let start_date = moment().startOf('month').format("YYYY-MM-DD");
        let end_date = moment().endOf('month').format("YYYY-MM-DD");
        query.date = {$gte: start_date, $lte: end_date};

        const incomes = await IncomeSchema.find(query).sort({createdAt: -1});
        const expenses = await ExpenseSchema.find(query).sort({createdAt: -1});
        res.status(200).json({
            response: {
                allData: combineAndSortByCreatedAt(incomes, expenses) || [],
                total_incomes: !!incomes.length ? incomes.reduce((a, b) => a + b.amount, 0) : 0,
                total_expenses: !!expenses.length ? expenses.reduce((a, b) => a + b.amount, 0) : 0,
            }
        })
    } catch
        (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.getProfile = async (req, res) => {
    try {
        const id = req.user.id;
        const user = await UserSchema.findById(id);

        const userObj = {
            email : user.email,
            username : user.username,
            id : user._id.toString()
        };

        res.status(200).json({data : userObj})
    } catch
        (error) {
        res.status(500).json({message: 'Server Error'})
    }
};
