const ExpenseSchema = require("../models/ExpenseModel");
const moment = require('moment');

exports.addExpense = async (req, res) => {
    const {amount, category, sub_category, description, date, type}  = req.body;

    const expense = ExpenseSchema({
        amount,
        category,
        sub_category,
        description,
        date,
        type,
        user: req.user.id,
    });

    try {
        await expense.save();
        res.status(200).json({message: 'Expense Added'})
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.updateExpense = async (req, res) => {
    const { amount, category, sub_category, description, date, type } = req.body;
    const expenseId = req.params.id;

    try {
        const expense = await ExpenseSchema.findById(expenseId);
        if (!expense) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        expense.amount = amount;
        expense.category = category;
        expense.sub_category = sub_category;
        expense.description = description;
        expense.date = date;
        expense.type = type;

        await expense.save();

        res.status(200).json({ message: 'Expense updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getExpense = async (req, res) => {
    try {
        const { start_date, end_date, keyword, type } = req.query;
        const query = { user: req.user.id };

        if (!start_date && !end_date) {
            const currentDate = moment().format('YYYY-MM-DD');
            query.date = { $eq: currentDate };
        } else {
            query.date = { $gte: start_date , $lte: end_date};
        }

        if (keyword) {
            const keywordRegExp = new RegExp(keyword, 'i');
            const parsedAmount = parseFloat(keyword);
            if (!isNaN(parsedAmount)) {
                query.amount = parsedAmount;
            } else {
                query.$or = [
                    { description: keywordRegExp },
                    { category: keywordRegExp },
                    { sub_category: keywordRegExp },
                ];
            }
        }

        if(type) {
            query.type = type
        }

        const expenses = await ExpenseSchema.find(query).sort({ createdAt: -1 });
        res.status(200).json({
            expenses,
            total_expenses: !!expenses.length ? expenses.reduce((a, b) => a + b.amount, 0) : 0,
        });
    } catch (error) {
        res.status(500).json({ message: error });
    }
};

exports.deleteExpense = async (req, res) =>{
    const {id} = req.params;
    ExpenseSchema.findByIdAndDelete(id)
        .then(() =>{
            res.status(200).json({message: 'Expense Deleted'})
        })
        .catch((err) =>{
            res.status(500).json({message: 'Server Error'})
        })
};
