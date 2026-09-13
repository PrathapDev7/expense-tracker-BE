const UserPreferenceSchema = require("../models/UserPreferenceModel");

const sanitize = (doc) => {
    if (!doc) return null;
    return {
        _id: doc._id,
        user: doc.user,
        currencySymbol: doc.currencySymbol,
        currencyCode: doc.currencyCode,
        defaultTxnType: doc.defaultTxnType,
        defaultCategory: doc.defaultCategory ?? null,
        defaultWallet: doc.defaultWallet ?? null,
        weekStart: doc.weekStart,
        theme: doc.theme,
    };
};

exports.getUserPreferences = async (req, res) => {
    try {
        let prefs = await UserPreferenceSchema.findOne({ user: req.user.id });
        if (!prefs) {
            prefs = await UserPreferenceSchema.create({ user: req.user.id });
        }
        res.status(200).json({ response: sanitize(prefs) });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

exports.updateUserPreferences = async (req, res) => {
    try {
        const allowed = [
            'currencySymbol', 'currencyCode', 'defaultTxnType',
            'defaultCategory', 'defaultWallet', 'weekStart', 'theme',
        ];
        if (req.body.theme !== undefined && !['light', 'dark', 'system'].includes(req.body.theme)) {
            return res.status(400).json({ message: 'Invalid theme value.' });
        }
        if (req.body.defaultTxnType !== undefined && !['expense', 'income'].includes(req.body.defaultTxnType)) {
            return res.status(400).json({ message: 'Invalid defaultTxnType value.' });
        }
        if (req.body.weekStart !== undefined && !['monday', 'sunday'].includes(req.body.weekStart)) {
            return res.status(400).json({ message: 'Invalid weekStart value.' });
        }
        const update = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }
        const prefs = await UserPreferenceSchema.findOneAndUpdate(
            { user: req.user.id },
            { $set: update },
            { new: true, upsert: true, runValidators: true }
        );
        res.status(200).json({ message: 'Preferences updated successfully', response: sanitize(prefs) });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};
