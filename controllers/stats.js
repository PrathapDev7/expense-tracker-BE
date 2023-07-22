const IncomeSchema= require("../models/IncomeModel");
const ExpenseSchema = require("../models/ExpenseModel");
const {combineAndSortByCreatedAt} = require("../Utils");

exports.getStats = async (req, res) =>{
    try {
        const incomes = await IncomeSchema.find({user: req.user.id}).sort({createdAt: -1});
        const expenses = await ExpenseSchema.find({user: req.user.id}).sort({createdAt: -1});
        res.status(200).json({response : {
            allData : combineAndSortByCreatedAt(incomes,expenses) || [],
                total_incomes : !!incomes.length ? incomes.reduce((a,b) => a + b.amount, 0) : 0,
                total_expenses : !!expenses.length ? expenses.reduce((a,b) => a + b.amount, 0) : 0,
        }})
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};