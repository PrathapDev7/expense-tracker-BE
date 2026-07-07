const UserSchema = require('../models/UserModel');
const ExpenseSchema = require('../models/ExpenseModel');
const IncomeSchema = require('../models/IncomeModel');
const GoalSchema = require('../models/GoalModel');
const WalletSchema = require('../models/WalletModel');
const RecurringSchema = require('../models/RecurringModel');
const moment = require('moment');

exports.getAdminStats = async (req, res) => {
    try {
        const [
            totalUsers,
            expenseAgg,
            incomeAgg,
            activeGoals,
            completedGoals,
            totalWallets,
            activeRecurring,
        ] = await Promise.all([
            UserSchema.countDocuments(),
            ExpenseSchema.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
            IncomeSchema.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
            GoalSchema.countDocuments({ completed: { $ne: true }, archived: { $ne: true } }),
            GoalSchema.countDocuments({ completed: true }),
            WalletSchema.countDocuments({ archived: { $ne: true } }),
            RecurringSchema.countDocuments({ active: true }),
        ]);

        const monthly = [];
        for (let i = 5; i >= 0; i--) {
            const d = moment().subtract(i, 'months');
            const prefix = d.format('YYYY-MM');
            const label = d.format('MMM YY');

            const [exp, inc] = await Promise.all([
                ExpenseSchema.aggregate([
                    { $match: { date: { $regex: `^${prefix}` } } },
                    { $group: { _id: null, total: { $sum: '$amount' } } },
                ]),
                IncomeSchema.aggregate([
                    { $match: { date: { $regex: `^${prefix}` } } },
                    { $group: { _id: null, total: { $sum: '$amount' } } },
                ]),
            ]);

            monthly.push({
                label,
                expenses: exp[0]?.total ?? 0,
                income: inc[0]?.total ?? 0,
            });
        }

        const topExpenseCategories = await ExpenseSchema.aggregate([
            { $group: { _id: '$category', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
            { $limit: 6 },
        ]);

        res.status(200).json({
            totalUsers,
            totalExpenses: expenseAgg[0]?.total ?? 0,
            totalIncome: incomeAgg[0]?.total ?? 0,
            activeGoals,
            completedGoals,
            totalWallets,
            activeRecurring,
            monthly,
            topExpenseCategories: topExpenseCategories.map((c) => ({
                name: c._id,
                value: c.total,
            })),
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getAdminUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page ?? '1');
        const limit = parseInt(req.query.limit ?? '20');
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            UserSchema.find({}, { password: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            UserSchema.countDocuments(),
        ]);

        const userIds = users.map((u) => u._id);
        const [expenseStats, incomeStats] = await Promise.all([
            ExpenseSchema.aggregate([
                { $match: { user: { $in: userIds } } },
                { $group: { _id: '$user', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            ]),
            IncomeSchema.aggregate([
                { $match: { user: { $in: userIds } } },
                { $group: { _id: '$user', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            ]),
        ]);

        const expMap = Object.fromEntries(expenseStats.map((e) => [String(e._id), e]));
        const incMap = Object.fromEntries(incomeStats.map((i) => [String(i._id), i]));

        const enriched = users.map((u) => ({
            ...u,
            _id: String(u._id),
            expenses: expMap[String(u._id)]?.total ?? 0,
            expenseCount: expMap[String(u._id)]?.count ?? 0,
            income: incMap[String(u._id)]?.total ?? 0,
            incomeCount: incMap[String(u._id)]?.count ?? 0,
        }));

        res.status(200).json({ users: enriched, total, page, limit });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getAdminTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page ?? '1');
        const limit = parseInt(req.query.limit ?? '30');
        const skip = (page - 1) * limit;
        const kind = req.query.kind;

        let expenses = [];
        let incomes = [];

        if (!kind || kind === 'expense') {
            expenses = await ExpenseSchema.find({})
                .populate('user', 'username mobile')
                .sort({ createdAt: -1 })
                .lean();
        }
        if (!kind || kind === 'income') {
            incomes = await IncomeSchema.find({})
                .populate('user', 'username mobile')
                .sort({ createdAt: -1 })
                .lean();
        }

        const combined = [
            ...expenses.map((e) => ({ ...e, _id: String(e._id), kind: 'expense' })),
            ...incomes.map((i) => ({ ...i, _id: String(i._id), kind: 'income' })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const total = combined.length;
        const paginated = combined.slice(skip, skip + limit);

        res.status(200).json({ transactions: paginated, total, page, limit });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getAdminWallets = async (req, res) => {
    try {
        const page = parseInt(req.query.page ?? '1');
        const limit = parseInt(req.query.limit ?? '20');
        const skip = (page - 1) * limit;

        const [wallets, total] = await Promise.all([
            WalletSchema.find({})
                .populate('user', 'username mobile')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            WalletSchema.countDocuments(),
        ]);

        res.status(200).json({
            wallets: wallets.map((w) => ({ ...w, _id: String(w._id) })),
            total,
            page,
            limit,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getAdminGoals = async (req, res) => {
    try {
        const page = parseInt(req.query.page ?? '1');
        const limit = parseInt(req.query.limit ?? '20');
        const skip = (page - 1) * limit;

        const [goals, total] = await Promise.all([
            GoalSchema.find({})
                .populate('user', 'username mobile')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            GoalSchema.countDocuments(),
        ]);

        res.status(200).json({
            goals: goals.map((g) => ({ ...g, _id: String(g._id) })),
            total,
            page,
            limit,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};
