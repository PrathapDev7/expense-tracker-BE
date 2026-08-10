const ExpenseSchema = require("../models/ExpenseModel");
const {resolveWalletId, WalletValidationError} = require('../middlewares/wallet');
const moment = require('moment');

exports.addExpense = async (req, res) => {
    const {amount, category, sub_category, description, date, type, account}  = req.body;

    try {
        const resolvedAccount = await resolveWalletId(req.user.id, account);
        const expense = ExpenseSchema({
            amount,
            category,
            sub_category,
            description,
            date,
            type,
            account: resolvedAccount,
            user: req.user.id,
        });

        await expense.save();
        res.status(200).json({message: 'Expense Added'})
    } catch (error) {
        if (error instanceof WalletValidationError) {
            return res.status(error.status).json({message: error.message});
        }
        res.status(500).json({message: 'Server Error'})
    }
};

exports.updateExpense = async (req, res) => {
    const { amount, category, sub_category, description, date, type, account } = req.body;
    const expenseId = req.params.id;

    try {
        const expense = await ExpenseSchema.findById(expenseId);
        if (!expense) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        // Re-resolve the wallet: honour an explicit account, otherwise keep the
        // existing one (falling back to the user's primary if the record has none).
        const resolvedAccount = await resolveWalletId(req.user.id, account !== undefined ? account : expense.account, {required: false});
        expense.account = resolvedAccount || expense.account;

        expense.amount = amount;
        expense.category = category;
        expense.sub_category = sub_category;
        expense.description = description;
        expense.date = date;
        expense.type = type;

        await expense.save();

        res.status(200).json({ message: 'Expense updated successfully' });
    } catch (error) {
        if (error instanceof WalletValidationError) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getExpense = async (req, res) => {
    try {
        const { start_date, end_date, keyword, type, category, account, min_amount, max_amount } = req.query;
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

        if (category) {
            query.category = category;
        }

        if (account) {
            query.account = account;
        }

        // Amount range filter — skipped if an exact amount was set by keyword.
        const min = min_amount !== undefined ? parseFloat(min_amount) : NaN;
        const max = max_amount !== undefined ? parseFloat(max_amount) : NaN;
        if ((!isNaN(min) || !isNaN(max)) && query.amount === undefined) {
            query.amount = {};
            if (!isNaN(min)) query.amount.$gte = min;
            if (!isNaN(max)) query.amount.$lte = max;
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
