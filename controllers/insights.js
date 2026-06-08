const moment = require('moment');
const ExpenseSchema = require('../models/ExpenseModel');
const IncomeSchema = require('../models/IncomeModel');

const sum = (arr) => arr.reduce((a, b) => a + (b.amount || 0), 0);
const byCategory = (arr) => arr.reduce((acc, t) => {
    const key = t.category || 'Other';
    acc[key] = (acc[key] || 0) + (t.amount || 0);
    return acc;
}, {});

exports.getInsights = async (req, res) => {
    try {
        const userId = req.user.id;
        const now = moment();

        const range = (m) => ({
            start: m.clone().startOf('month').format('YYYY-MM-DD'),
            end: m.clone().endOf('month').format('YYYY-MM-DD'),
        });
        const cur = range(now);
        const prev = range(now.clone().subtract(1, 'month'));

        const fetch = ({start, end}) => Promise.all([
            ExpenseSchema.find({user: userId, date: {$gte: start, $lte: end}}).lean(),
            IncomeSchema.find({user: userId, date: {$gte: start, $lte: end}}).lean(),
        ]);

        const [[curExp, curInc], [prevExp]] = await Promise.all([fetch(cur), fetch(prev)]);

        const curExpTotal = sum(curExp);
        const prevExpTotal = sum(prevExp);
        const curIncTotal = sum(curInc);

        const curCat = byCategory(curExp);
        const prevCat = byCategory(prevExp);

        const categories = Object.keys({...curCat, ...prevCat}).map((name) => {
            const current = curCat[name] || 0;
            const previous = prevCat[name] || 0;
            return {
                name,
                current,
                previous,
                delta: current - previous,
                deltaPct: previous ? ((current - previous) / previous) * 100 : (current ? 100 : 0),
            };
        }).sort((a, b) => b.current - a.current);

        const movers = [...categories]
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 3);

        const dayOfMonth = now.date();
        const daysInMonth = now.daysInMonth();
        const projectedExpense = dayOfMonth ? (curExpTotal / dayOfMonth) * daysInMonth : curExpTotal;

        const savings = curIncTotal - curExpTotal;

        res.status(200).json({
            data: {
                month: now.format('MMMM YYYY'),
                current: {
                    expense: curExpTotal,
                    income: curIncTotal,
                    savings,
                    savingsRate: curIncTotal ? (savings / curIncTotal) * 100 : 0,
                },
                previous: {expense: prevExpTotal},
                expenseDelta: curExpTotal - prevExpTotal,
                expenseDeltaPct: prevExpTotal ? ((curExpTotal - prevExpTotal) / prevExpTotal) * 100 : (curExpTotal ? 100 : 0),
                projectedExpense,
                topCategories: categories.slice(0, 5),
                movers,
                categories,
            },
        });
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
