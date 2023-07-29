const ExpenseSchema = require("../models/ExpenseModel");
const moment = require('moment');

exports.addExpense = async (req, res) => {
    const {amount, category, description, date, sub_category}  = req.body;

    const expense = ExpenseSchema({
        amount,
        category,
        sub_category,
        description,
        date,
        user: req.user.id,
    });

    try {
        //validations
        if(!category || !date){
            return res.status(400).json({message: 'All fields are required!'})
        }
        if(amount <= 0 || !amount === 'number'){
            return res.status(400).json({message: 'Amount must be a positive number!'})
        }
        await expense.save();
        res.status(200).json({message: 'Expense Added'})
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.updateExpense = async (req, res) => {
    const { amount, category, description, date, sub_category } = req.body;
    const expenseId = req.params.id; // Assuming the expense ID is passed as a route parameter

    try {
        // Check if the expense exists in the database
        const expense = await ExpenseSchema.findById(expenseId);
        if (!expense) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        // Perform validations on the updated data (similar to the addExpense function)
        if (!category || !date) {
            return res.status(400).json({ message: 'All fields are required!' });
        }

        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ message: 'Amount must be a positive number!' });
        }

        // Update the expense with the new data
        expense.amount = amount;
        expense.category = category;
        expense.sub_category = sub_category;
        expense.description = description;
        expense.date = date;

        // Save the updated expense to the database
        await expense.save();

        res.status(200).json({ message: 'Expense updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getExpense = async (req, res) => {
    try {
        const { start_date, end_date, keyword } = req.query;
        const query = { user: req.user.id };

        if (!start_date && !end_date) {
            const currentDate = moment().format('YYYY-MM-DD');
            query.date = { $eq: currentDate };
        } else {
            query.date = { $gte: start_date , $lte: end_date};
        }

        if (keyword) {
            const keywordRegExp = new RegExp(keyword, 'i');
            // Check if the keyword is a valid number
            const parsedAmount = parseFloat(keyword);
            if (!isNaN(parsedAmount)) {
                // If it's a valid number, include the amount field in the query
                query.amount = parsedAmount;
            } else {
                query.$or = [
                    { description: keywordRegExp },
                    { category: keywordRegExp },
                    { sub_category: keywordRegExp },
                ];
            }
        }

        const expenses = await ExpenseSchema.find(query).sort({ createdAt: -1 });
        res.status(200).json(expenses);
    } catch (error) {
        res.status(500).json({ message: error });
    }
};

exports.deleteExpense = async (req, res) =>{
    const {id} = req.params;
    ExpenseSchema.findByIdAndDelete(id)
        .then((income) =>{
            res.status(200).json({message: 'Expense Deleted'})
        })
        .catch((err) =>{
            res.status(500).json({message: 'Server Error'})
        })
};
