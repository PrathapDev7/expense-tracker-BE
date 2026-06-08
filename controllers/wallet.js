const mongoose = require('mongoose');
const WalletSchema = require('../models/WalletModel');
const ExpenseSchema = require('../models/ExpenseModel');
const IncomeSchema = require('../models/IncomeModel');

exports.addWallet = async (req, res) => {
    const {name, kind, openingBalance, icon, color} = req.body;
    try {
        if (!name) {
            return res.status(400).json({message: 'Wallet name is required.'});
        }
        const wallet = await WalletSchema.create({
            user: req.user.id,
            name: name.trim(),
            kind: kind || 'cash',
            openingBalance: openingBalance || 0,
            icon,
            color,
        });
        res.status(200).json({message: 'Wallet added', data: wallet});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getWallets = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const wallets = await WalletSchema.find({user: req.user.id, archived: {$ne: true}})
            .sort({createdAt: 1});

        // Sum transactions per wallet (transactions store wallet _id in `account`).
        const sumByAccount = async (Model) => {
            const rows = await Model.aggregate([
                {$match: {user: userId, account: {$nin: [null, '']}}},
                {$group: {_id: '$account', total: {$sum: '$amount'}}},
            ]);
            return rows.reduce((acc, r) => {
                acc[String(r._id)] = r.total;
                return acc;
            }, {});
        };

        const [expenseByAccount, incomeByAccount] = await Promise.all([
            sumByAccount(ExpenseSchema),
            sumByAccount(IncomeSchema),
        ]);

        const data = wallets.map((w) => {
            const id = String(w._id);
            const income = incomeByAccount[id] || 0;
            const expense = expenseByAccount[id] || 0;
            return {
                ...w.toObject(),
                income,
                expense,
                balance: (w.openingBalance || 0) + income - expense,
            };
        });

        res.status(200).json({data});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateWallet = async (req, res) => {
    const {id} = req.params;
    const allowed = ['name', 'kind', 'openingBalance', 'icon', 'color', 'archived'];
    try {
        const wallet = await WalletSchema.findOne({_id: id, user: req.user.id});
        if (!wallet) {
            return res.status(404).json({message: 'Wallet not found'});
        }
        allowed.forEach((key) => {
            if (req.body[key] !== undefined) wallet[key] = req.body[key];
        });
        if (req.body.name !== undefined) wallet.name = (req.body.name || '').trim();
        await wallet.save();
        res.status(200).json({message: 'Wallet updated', data: wallet});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteWallet = async (req, res) => {
    const {id} = req.params;
    try {
        // Soft-delete so existing transactions keep their account reference.
        const wallet = await WalletSchema.findOneAndUpdate(
            {_id: id, user: req.user.id},
            {$set: {archived: true}},
            {new: true}
        );
        if (!wallet) {
            return res.status(404).json({message: 'Wallet not found'});
        }
        res.status(200).json({message: 'Wallet deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
