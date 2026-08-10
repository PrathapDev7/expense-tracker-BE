const moment = require('moment');
const RecurringSchema = require('../models/RecurringModel');
const ExpenseSchema = require('../models/ExpenseModel');
const IncomeSchema = require('../models/IncomeModel');
const {resolveWallet, resolveWalletId, WalletValidationError} = require('../middlewares/wallet');

const DATE_FMT = 'YYYY-MM-DD';
const FREQ_UNIT = {daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years'};

const advanceDate = (dateStr, frequency, interval) =>
    moment(dateStr, DATE_FMT).add(interval || 1, FREQ_UNIT[frequency]).format(DATE_FMT);

/**
 * Lazily generate any transactions due for a user's active recurring rules.
 * Idempotent: each occurrence advances nextRunDate, so re-running never
 * double-creates. Called from getStats so the dashboard is always current.
 */
const materializeRecurring = async (userId) => {
    const today = moment().format(DATE_FMT);
    const rules = await RecurringSchema.find({
        user: userId,
        active: true,
        nextRunDate: {$lte: today},
    });

    // Resolve each rule's wallet once. The rule's own `account` wins; when it
    // is missing or its wallet was archived, fall back to the user's primary.
    const accountByRule = new Map();
    for (const rule of rules) {
        try {
            const wallet = await resolveWallet(userId, rule.account);
            accountByRule.set(String(rule._id), wallet ? String(wallet._id) : null);
        } catch (e) {
            // Rule's wallet no longer resolvable — fall back to the primary.
            const primary = await resolveWallet(userId, undefined);
            accountByRule.set(String(rule._id), primary ? String(primary._id) : null);
        }
    }

    for (const rule of rules) {
        let guard = 0; // safety against runaway loops
        while (rule.active && rule.nextRunDate <= today && guard < 750) {
            if (rule.endDate && rule.nextRunDate > rule.endDate) {
                rule.active = false;
                break;
            }

            const account = accountByRule.get(String(rule._id));
            if (!account) {
                // No wallet available for this rule — skip the occurrence so we
                // never create a wallet-less transaction.
                rule.active = false;
                break;
            }

            const Model = rule.kind === 'income' ? IncomeSchema : ExpenseSchema;
            const doc = {
                amount: rule.amount,
                category: rule.category,
                description: rule.description,
                date: rule.nextRunDate,
                user: userId,
                type: rule.type || (rule.kind === 'income' ? 'income' : 'self'),
                account,
            };
            if (rule.kind === 'income') {
                doc.title = rule.title;
            } else {
                doc.sub_category = rule.sub_category;
            }

            await Model.create(doc);

            rule.lastRunDate = rule.nextRunDate;
            rule.nextRunDate = advanceDate(rule.nextRunDate, rule.frequency, rule.interval);
            guard += 1;
        }
        await rule.save();
    }
};

exports.materializeRecurring = materializeRecurring;

exports.addRecurring = async (req, res) => {
    const {kind, amount, category, sub_category, title, description, type,
        account, frequency, interval, startDate, endDate} = req.body;

    try {
        if (!kind || !amount || !category || !frequency || !startDate) {
            return res.status(400).json({message: 'kind, amount, category, frequency and startDate are required.'});
        }
        if (!FREQ_UNIT[frequency]) {
            return res.status(400).json({message: 'Invalid frequency.'});
        }
        const resolvedAccount = await resolveWalletId(req.user.id, account);

        const rule = await RecurringSchema.create({
            user: req.user.id,
            kind,
            amount,
            category: (category || '').trim(),
            sub_category,
            title,
            description,
            type,
            account: resolvedAccount,
            frequency,
            interval: interval || 1,
            startDate,
            nextRunDate: startDate,
            endDate,
        });

        // Backfill anything already due (e.g. a start date in the past).
        await materializeRecurring(req.user.id);

        res.status(200).json({message: 'Recurring added', data: rule});
    } catch (error) {
        if (error instanceof WalletValidationError) {
            return res.status(error.status).json({message: error.message});
        }
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getRecurring = async (req, res) => {
    try {
        const rules = await RecurringSchema.find({user: req.user.id}).sort({createdAt: -1});
        res.status(200).json({data: rules});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateRecurring = async (req, res) => {
    const {id} = req.params;
    const allowed = ['kind', 'amount', 'category', 'sub_category', 'title', 'description',
        'type', 'account', 'frequency', 'interval', 'startDate', 'endDate', 'nextRunDate', 'active'];

    try {
        const rule = await RecurringSchema.findOne({_id: id, user: req.user.id});
        if (!rule) {
            return res.status(404).json({message: 'Recurring rule not found'});
        }

        allowed.forEach((key) => {
            if (req.body[key] !== undefined) rule[key] = req.body[key];
        });
        if (req.body.category !== undefined) rule.category = (req.body.category || '').trim();

        // Re-resolve the wallet whenever it changed; a missing account falls
        // back to the user's primary so rules never end up wallet-less.
        if (req.body.account !== undefined) {
            rule.account = await resolveWalletId(req.user.id, req.body.account, {required: false})
                || rule.account;
        }
        await rule.save();

        res.status(200).json({message: 'Recurring updated', data: rule});
    } catch (error) {
        if (error instanceof WalletValidationError) {
            return res.status(error.status).json({message: error.message});
        }
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteRecurring = async (req, res) => {
    const {id} = req.params;
    try {
        const rule = await RecurringSchema.findOneAndDelete({_id: id, user: req.user.id});
        if (!rule) {
            return res.status(404).json({message: 'Recurring rule not found'});
        }
        res.status(200).json({message: 'Recurring deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
