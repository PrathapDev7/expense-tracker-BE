const UserBudgetSchema = require("../models/UserBudgetModel");

exports.addUserBudget = async (req, res) => {
    const {budgets}  = req.body;

    const userBudget = UserBudgetSchema({
        budgets : budgets,
        user: req.user.id,
    });

    try {
        await userBudget.save();
        res.status(200).json({message: 'Budget Added'})
    } catch (error) {
        res.status(500).json({message: 'Server Error', error})
    }
};

exports.updateUserBudget = async (req, res) => {
    const { budgets } = req.body;
    const budgetId = req.params.id;

    try {
        const budget = await UserBudgetSchema.findById(budgetId);
        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        budget.budgets = budgets;
        await budget.save();

        res.status(200).json({ message: 'Budget updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getUserBudget = async (req, res) => {
    try {
        const query = { user: req.user.id };
        const budgets = await UserBudgetSchema.findOne(query).sort({ createdAt: -1 });
        res.status(200).json({response: budgets});
    } catch (error) {
        res.status(500).json({ message: error });
    }
};
