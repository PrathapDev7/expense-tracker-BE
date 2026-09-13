const moment = require('moment');
const RecurringSchema = require('../models/RecurringModel');
const ExpenseSchema = require('../models/ExpenseModel');
const UserBudgetSchema = require('../models/UserBudgetModel');
const UserSchema = require('../models/UserModel');
const {materializeRecurring} = require('../controllers/recurring');
const {createNotification} = require('./notifications');

const DATE_FMT = 'YYYY-MM-DD';

const materializeAllRecurring = async () => {
    try {
        const rules = await RecurringSchema.find({active: true}).distinct('user');
        let created = 0;
        for (const userId of rules) {
            const uid = String(userId);
            const before = await ExpenseSchema.countDocuments({user: uid, recurringId: {$ne: null}});
            await materializeRecurring(uid);
            const after = await ExpenseSchema.countDocuments({user: uid, recurringId: {$ne: null}});
            if (after > before) {
                created += after - before;
                await createNotification(uid, {
                    type: 'recurring_created',
                    title: 'Recurring transactions created',
                    body: `${after - before} recurring ${(after - before) === 1 ? 'entry was' : 'entries were'} added.`,
                });
            }
        }
        console.log(`[scheduler] materialized recurring for ${rules.length} users (${created} created)`);
    } catch (e) {
        console.error('[scheduler] materializeAllRecurring failed:', e.message);
    }
};

const billDueCheck = async () => {
    try {
        const today = moment().format(DATE_FMT);
        const rules = await RecurringSchema.find({active: true, isBill: true});
        for (const rule of rules) {
            const remindDays = rule.remindBeforeDays ?? 2;
            const remindDate = moment(rule.nextRunDate, DATE_FMT)
                .subtract(remindDays, 'days')
                .format(DATE_FMT);
            if (remindDate <= today && rule.nextRunDate >= today) {
                const label = rule.title || rule.category;
                await createNotification(String(rule.user), {
                    type: 'bill_due',
                    title: `Bill due soon: ${label}`,
                    body: `${label} of ${rule.amount} is due on ${rule.nextRunDate}.`,
                    data: {recurringId: String(rule._id), nextRunDate: rule.nextRunDate},
                });
            }
        }
        console.log(`[scheduler] bill due check done (${rules.length} bill rules)`);
    } catch (e) {
        console.error('[scheduler] billDueCheck failed:', e.message);
    }
};

const budgetThresholdCheck = async () => {
    try {
        const start = moment().startOf('month').format(DATE_FMT);
        const end = moment().endOf('month').format(DATE_FMT);
        const budgets = await UserBudgetSchema.find({});
        for (const doc of budgets) {
            const userId = String(doc.user);
            const limits = doc.budgets || {};
            const expenses = await ExpenseSchema.find({
                user: userId,
                date: {$gte: start, $lte: end},
            }).lean();
            const spentByCat = {};
            for (const e of expenses) {
                spentByCat[e.category] = (spentByCat[e.category] || 0) + e.amount;
            }
            for (const [cat, limit] of Object.entries(limits)) {
                const numLimit = Number(limit);
                if (!numLimit || numLimit <= 0) continue;
                const spent = spentByCat[cat] || 0;
                const ratio = spent / numLimit;
                if (ratio >= 1) {
                    await createNotification(userId, {
                        type: 'budget_alert',
                        title: `Over budget: ${cat}`,
                        body: `Spent ${spent} of ${numLimit} on ${cat}.`,
                        data: {category: cat, spent, limit: numLimit},
                    });
                } else if (ratio >= 0.8) {
                    await createNotification(userId, {
                        type: 'budget_alert',
                        title: `Near budget limit: ${cat}`,
                        body: `Spent ${spent} of ${numLimit} on ${cat} (80%+).`,
                        data: {category: cat, spent, limit: numLimit},
                    });
                }
            }
        }
        console.log(`[scheduler] budget check done (${budgets.length} budget docs)`);
    } catch (e) {
        console.error('[scheduler] budgetThresholdCheck failed:', e.message);
    }
};

const startScheduler = () => {
    let cron = null;
    try {
        cron = require('node-cron');
    } catch (e) {
        console.error('[scheduler] node-cron not installed, scheduler disabled.');
        return;
    }
    cron.schedule('0 8 * * *', async () => {
        console.log('[scheduler] running daily jobs');
        await materializeAllRecurring();
        await billDueCheck();
        await budgetThresholdCheck();
    });
    console.log('[scheduler] daily jobs scheduled (08:00)');
};

module.exports = {
    startScheduler,
    materializeAllRecurring,
    billDueCheck,
    budgetThresholdCheck,
};
