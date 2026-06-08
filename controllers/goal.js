const moment = require('moment');
const GoalSchema = require('../models/GoalModel');

exports.addGoal = async (req, res) => {
    const {name, targetAmount, savedAmount, targetDate, icon, color, note} = req.body;

    try {
        if (!name || !targetAmount) {
            return res.status(400).json({message: 'name and targetAmount are required.'});
        }

        const goal = await GoalSchema.create({
            user: req.user.id,
            name: name.trim(),
            targetAmount,
            savedAmount: savedAmount || 0,
            targetDate,
            icon,
            color,
            note,
        });

        res.status(200).json({message: 'Goal added', data: goal});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getGoals = async (req, res) => {
    try {
        const goals = await GoalSchema.find({user: req.user.id, archived: {$ne: true}})
            .sort({completed: 1, createdAt: -1});
        res.status(200).json({data: goals});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateGoal = async (req, res) => {
    const {id} = req.params;
    const allowed = ['name', 'targetAmount', 'savedAmount', 'targetDate', 'icon', 'color', 'note', 'completed', 'archived'];

    try {
        const goal = await GoalSchema.findOne({_id: id, user: req.user.id});
        if (!goal) {
            return res.status(404).json({message: 'Goal not found'});
        }

        allowed.forEach((key) => {
            if (req.body[key] !== undefined) goal[key] = req.body[key];
        });
        if (req.body.name !== undefined) goal.name = (req.body.name || '').trim();
        goal.completed = goal.savedAmount >= goal.targetAmount;
        await goal.save();

        res.status(200).json({message: 'Goal updated', data: goal});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.contributeGoal = async (req, res) => {
    const {id} = req.params;
    const {amount, note} = req.body;

    try {
        const numericAmount = Number(amount);
        if (!numericAmount || Number.isNaN(numericAmount)) {
            return res.status(400).json({message: 'A valid amount is required.'});
        }

        const goal = await GoalSchema.findOne({_id: id, user: req.user.id});
        if (!goal) {
            return res.status(404).json({message: 'Goal not found'});
        }

        goal.savedAmount = (goal.savedAmount || 0) + numericAmount;
        goal.contributions.push({
            amount: numericAmount,
            date: moment().format('YYYY-MM-DD'),
            note,
        });
        goal.completed = goal.savedAmount >= goal.targetAmount;
        await goal.save();

        res.status(200).json({message: 'Contribution added', data: goal});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteGoal = async (req, res) => {
    const {id} = req.params;
    try {
        const goal = await GoalSchema.findOneAndDelete({_id: id, user: req.user.id});
        if (!goal) {
            return res.status(404).json({message: 'Goal not found'});
        }
        res.status(200).json({message: 'Goal deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
