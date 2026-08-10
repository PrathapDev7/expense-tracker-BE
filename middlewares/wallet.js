const mongoose = require('mongoose');
const WalletSchema = require('../models/WalletModel');

/**
 * Error used when a wallet cannot be resolved. Carries the HTTP status so
 * controllers can respond consistently without re-checking.
 */
class WalletValidationError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

/**
 * Resolve the wallet a transaction should belong to.
 *
 * - If `rawAccount` is provided it must be a valid ObjectId of a non-archived
 *   wallet owned by the user, otherwise an error is thrown.
 * - If omitted, falls back to the user's primary wallet (when
 *   `fallbackToPrimary` is true).
 *
 * Returns the wallet document, or null when nothing could be resolved and the
 * fallback was not required.
 */
const resolveWallet = async (userId, rawAccount, {fallbackToPrimary = true} = {}) => {
    if (rawAccount !== undefined && rawAccount !== null && String(rawAccount).trim() !== '') {
        const account = String(rawAccount).trim();
        if (!mongoose.Types.ObjectId.isValid(account)) {
            throw new WalletValidationError('Invalid wallet.', 400);
        }
        const wallet = await WalletSchema.findOne({_id: account, user: userId, archived: {$ne: true}});
        if (!wallet) {
            throw new WalletValidationError('Wallet not found.', 400);
        }
        return wallet;
    }

    if (fallbackToPrimary) {
        return WalletSchema.findOne({user: userId, archived: {$ne: true}, isPrimary: true});
    }
    return null;
};

/**
 * Resolve the wallet and return its id as a string.
 *
 * When the wallet is required (`required` true) and nothing resolves, throws a
 * `WalletValidationError` with the given message. When optional, returns null.
 */
const resolveWalletId = async (userId, rawAccount, {fallbackToPrimary = true, required = true, requiredMessage = 'Wallet is required.'} = {}) => {
    const wallet = await resolveWallet(userId, rawAccount, {fallbackToPrimary});
    if (!wallet && required) {
        throw new WalletValidationError(requiredMessage, 400);
    }
    return wallet ? String(wallet._id) : null;
};

module.exports = {
    resolveWallet,
    resolveWalletId,
    WalletValidationError,
};
