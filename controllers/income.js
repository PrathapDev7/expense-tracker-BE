const IncomeSchema = require("../models/IncomeModel");
const {resolveWalletId, WalletValidationError} = require('../middlewares/wallet');
const moment = require('moment');

exports.addIncome = async (req, res) => {
    const {title, amount, category, description, date, account} = req.body;

    try {
        if (!category || !date) {
            return res.status(400).json({message: 'Category and date are required.'});
        }
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({message: 'Amount must be a positive number.'});
        }
        const resolvedAccount = await resolveWalletId(req.user.id, account);
        const income = IncomeSchema({
            title,
            amount,
            category,
            description,
            date,
            account: resolvedAccount,
            user: req.user.id,
        });

        await income.save();
        res.status(200).json({message: 'Income Added'});
    } catch (error) {
        if (error instanceof WalletValidationError) {
            return res.status(error.status).json({message: error.message});
        }
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateIncome = async (req, res) => {
    const {title, amount, category, description, date, account} = req.body;
    const incomeId = req.params.id;

    try {
        const income = await IncomeSchema.findById(incomeId);
        if (!income) {
            return res.status(404).json({message: 'Income record not found'});
        }

        if (!category || !date) {
            return res.status(400).json({message: 'Category and date are required.'});
        }
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({message: 'Amount must be a positive number.'});
        }

        // Re-resolve the wallet: honour an explicit account, otherwise keep the
        // existing one (falling back to the user's primary if the record has none).
        const resolvedAccount = await resolveWalletId(req.user.id, account !== undefined ? account : income.account, {required: false});
        income.account = resolvedAccount || income.account;

        income.title = title;
        income.amount = amount;
        income.category = category;
        income.description = description;
        income.date = date;
        await income.save();

        res.status(200).json({message: 'Income updated successfully'});
    } catch (error) {
        if (error instanceof WalletValidationError) {
            return res.status(error.status).json({message: error.message});
        }
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getIncomes = async (req, res) => {
    try {
        const {start_date, end_date, keyword, category, account, min_amount, max_amount} = req.query;
        const query = {user: req.user.id};

        if (!start_date && !end_date) {
            const currentDate = moment().format('YYYY-MM-DD');
            query.date = {$eq: currentDate};
        } else {
            query.date = {$gte: start_date, $lte: end_date};
        }

        if (keyword) {
            const keywordRegExp = new RegExp(keyword, 'i');
            const parsedAmount = parseFloat(keyword);
            if (!isNaN(parsedAmount)) {
                query.amount = parsedAmount;
            } else {
                query.$or = [
                    {description: keywordRegExp},
                    {category: keywordRegExp},
                    {title: keywordRegExp},
                ];
            }
        }

        if (category) {
            query.category = category;
        }

        if (account) {
            query.account = account;
        }

        const min = min_amount !== undefined ? parseFloat(min_amount) : NaN;
        const max = max_amount !== undefined ? parseFloat(max_amount) : NaN;
        if ((!isNaN(min) || !isNaN(max)) && query.amount === undefined) {
            query.amount = {};
            if (!isNaN(min)) query.amount.$gte = min;
            if (!isNaN(max)) query.amount.$lte = max;
        }

        const incomes = await IncomeSchema.find(query).sort({createdAt: -1});
        res.status(200).json(incomes);
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteIncome = async (req, res) => {
    const {id} = req.params;
    IncomeSchema.findByIdAndDelete(id)
        .then(() => {
            res.status(200).json({message: 'Income Deleted'});
        })
        .catch(() => {
            res.status(500).json({message: 'Server Error'});
        });
};
