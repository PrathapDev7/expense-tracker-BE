const CalorieEntry = require('../models/CalorieEntryModel');
const moment = require('moment');
const { processEntry } = require('../services/groq');

exports.addCalories = async (req, res) => {
  const { date } = req.body;

  const userId = req.user.id;
  const targetDate = date || moment().format('YYYY-MM-DD');

  try {
    const updated = await CalorieEntry.findOneAndUpdate(
      { user: userId, date: targetDate },
      { $set: { user: userId, date: targetDate, status: 'pending' } },
      { upsert: true, new: true }
    );

    res.json({ success: true, entryId: updated._id, status: updated.status });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.processFoodText = async (req, res) => {
  const { entryId, text } = req.body;

  if (!entryId || !text || !text.trim()) {
    return res.status(400).json({ message: 'Missing entryId or text.' });
  }

  try {
    const result = await processEntry(entryId, text);
    res.json({ success: true, ...result, status: 'success' });
  } catch (err) {
    console.error('processFoodText error:', err.message || err);
    await CalorieEntry.findByIdAndUpdate(entryId, { status: 'failed' });
    res.status(500).json({
      message: `Failed to parse food text: ${err.message || 'Unknown error'}`,
      rawResponse: err.message || null,
      status: 'failed',
    });
  }
};

exports.getDailyCalories = async (req, res) => {
  const { date } = req.query;
  const userId = req.user.id;
  const targetDate = date || moment().format('YYYY-MM-DD');

  try {
    const entry = await CalorieEntry.findOne({ user: userId, date: targetDate }).lean();

    if (!entry || entry.mealItems.length === 0) {
      return res.json({
        success: true,
        mealItems: [],
        dailyTotals: null,
        status: 'pending',
        dailyTargets: {
          calorieTarget: 2000,
          carbTarget: 200,
          fatTarget: 80,
          proteinTarget: 100,
        },
      });
    }

    res.json({
      success: true,
      date: entry.date,
      mealItems: entry.mealItems,
      dailyTotals: entry.dailyTotals,
      status: entry.status,
      dailyTargets: {
        calorieTarget: entry.calorieTarget || 2000,
        carbTarget: entry.carbTarget || 200,
        fatTarget: entry.fatTarget || 80,
        proteinTarget: entry.proteinTarget || 100,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.deleteMealItem = async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user.id;

  try {
    const entry = await CalorieEntry.findOne({ user: userId });
    if (!entry) return res.status(404).json({ message: 'No entry found for today.' });

    const itemIndex = entry.mealItems.findIndex(i => i._id.toString() === itemId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not found.' });

    entry.mealItems.splice(itemIndex, 1);

    entry.dailyTotals = entry.mealItems.reduce((acc, item) => {
      acc.calories += item.calories || 0;
      acc.protein += item.protein || 0;
      acc.carbs += item.carbs || 0;
      acc.fat += item.fat || 0;
      acc.fiber += item.fiber || 0;
      acc.sugar += item.sugar || 0;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 });

    await entry.save();

    res.json({ success: true, mealItems: entry.mealItems, dailyTotals: entry.dailyTotals });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};
