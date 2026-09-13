const moment = require('moment');
const TransferSchema = require('../models/TransferModel');
const {resolveWallet, WalletValidationError} = require('../middlewares/wallet');

exports.addTransfer = async (req, res) => {
    const {fromWallet, toWallet, amount, date, note} = req.body;
    try {
        const numAmount = Number(amount);
        if (!fromWallet || !toWallet) {
            return res.status(400).json({message: 'fromWallet and toWallet are required.'});
        }
        if (String(fromWallet) === String(toWallet)) {
            return res.status(400).json({message: 'Cannot transfer to the same wallet.'});
        }
        if (!numAmount || numAmount <= 0) {
            return res.status(400).json({message: 'Amount must be greater than zero.'});
        }

        const from = await resolveWallet(req.user.id, fromWallet, {fallbackToPrimary: false});
        const to = await resolveWallet(req.user.id, toWallet, {fallbackToPrimary: false});
        if (!from || !to) {
            return res.status(400).json({message: 'Wallet is required.'});
        }

        const transfer = await TransferSchema.create({
            user: req.user.id,
            fromWallet: from._id,
            toWallet: to._id,
            amount: numAmount,
            date: date || moment().format('YYYY-MM-DD'),
            note,
        });
        res.status(200).json({message: 'Transfer added', data: transfer});
    } catch (error) {
        if (error instanceof WalletValidationError) {
            return res.status(error.status).json({message: error.message});
        }
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getTransfers = async (req, res) => {
    try {
        const transfers = await TransferSchema.find({user: req.user.id})
            .sort({date: -1, createdAt: -1});
        res.status(200).json({data: transfers});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteTransfer = async (req, res) => {
    const {id} = req.params;
    try {
        const transfer = await TransferSchema.findOneAndDelete({_id: id, user: req.user.id});
        if (!transfer) {
            return res.status(404).json({message: 'Transfer not found'});
        }
        res.status(200).json({message: 'Transfer deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
