const mongoose = require('mongoose');
const WalletSchema = require('../models/WalletModel');
const ExpenseSchema = require('../models/ExpenseModel');
const IncomeSchema = require('../models/IncomeModel');
const TransferSchema = require('../models/TransferModel');

exports.addWallet = async (req, res) => {
    const {
        name, kind, openingBalance, icon, color,
        provider, providerName, cardType, last4, holderName, reminderDay, expiry,
        owedBalance, creditLimit, apr, minPayment, dueDay,
    } = req.body;
    try {
        if (!name) {
            return res.status(400).json({message: 'Wallet name is required.'});
        }
        // The first wallet a user creates becomes their primary.
        const walletCount = await WalletSchema.countDocuments({user: req.user.id});
        const wallet = await WalletSchema.create({
            user: req.user.id,
            name: name.trim(),
            kind: kind || 'cash',
            openingBalance: openingBalance || 0,
            icon,
            color,
            provider,
            providerName,
            cardType: cardType || '',
            last4,
            holderName,
            reminderDay,
            expiry,
            owedBalance: owedBalance || 0,
            creditLimit,
            apr,
            minPayment,
            dueDay,
            isPrimary: walletCount === 0,
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

        const [expenseByAccount, incomeByAccount, transferOutByWallet, transferInByWallet] = await Promise.all([
            sumByAccount(ExpenseSchema),
            sumByAccount(IncomeSchema),
            TransferSchema.aggregate([
                {$match: {user: userId}},
                {$group: {_id: '$fromWallet', total: {$sum: '$amount'}}},
            ]).then((rows) => rows.reduce((acc, r) => {
                acc[String(r._id)] = r.total;
                return acc;
            }, {})),
            TransferSchema.aggregate([
                {$match: {user: userId}},
                {$group: {_id: '$toWallet', total: {$sum: '$amount'}}},
            ]).then((rows) => rows.reduce((acc, r) => {
                acc[String(r._id)] = r.total;
                return acc;
            }, {})),
        ]);

        const data = wallets.map((w) => {
            const id = String(w._id);
            const income = incomeByAccount[id] || 0;
            const expense = expenseByAccount[id] || 0;
            const transferOut = transferOutByWallet[id] || 0;
            const transferIn = transferInByWallet[id] || 0;
            return {
                ...w.toObject(),
                income,
                expense,
                transferIn,
                transferOut,
                balance: (w.openingBalance || 0) + income - expense - transferOut + transferIn,
            };
        });

        res.status(200).json({data});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateWallet = async (req, res) => {
    const {id} = req.params;
    const allowed = [
        'name', 'kind', 'openingBalance', 'icon', 'color', 'archived',
        'provider', 'providerName', 'cardType', 'last4', 'holderName',
        'reminderDay', 'expiry', 'isPrimary',
        'owedBalance', 'creditLimit', 'apr', 'minPayment', 'dueDay',
    ];
    try {
        const wallet = await WalletSchema.findOne({_id: id, user: req.user.id});
        if (!wallet) {
            return res.status(404).json({message: 'Wallet not found'});
        }

        // Only one wallet can be primary — clear the others first.
        if (req.body.isPrimary === true) {
            await WalletSchema.updateMany(
                {user: req.user.id, _id: {$ne: id}},
                {$set: {isPrimary: false}}
            );
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

        // If the primary wallet was archived, promote the oldest remaining one
        // so the user is never left without a primary.
        if (wallet.isPrimary) {
            await WalletSchema.findOneAndUpdate(
                {user: req.user.id, archived: {$ne: true}, _id: {$ne: id}},
                {$set: {isPrimary: true}},
                {sort: {createdAt: 1}}
            );
        }
        res.status(200).json({message: 'Wallet deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getDebts = async (req, res) => {
    try {
        const wallets = await WalletSchema.find({
            user: req.user.id,
            archived: {$ne: true},
            $or: [
                {kind: 'card'},
                {owedBalance: {$gt: 0}},
                {creditLimit: {$ne: null}},
            ],
        }).sort({dueDay: 1, createdAt: 1});

        const data = wallets.map((w) => {
            const obj = w.toObject();
            const owed = obj.owedBalance || 0;
            const limit = obj.creditLimit || null;
            return {
                ...obj,
                utilization: limit ? owed / limit : null,
                payoffProgress: limit ? Math.max(0, Math.min(1, (limit - owed) / limit)) : null,
                effectiveDueDay: obj.dueDay || obj.reminderDay || null,
            };
        });

        const totalOwed = data.reduce((sum, w) => sum + (w.owedBalance || 0), 0);
        res.status(200).json({data, totalOwed});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
