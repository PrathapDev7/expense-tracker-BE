const CalorieEntry = require('../models/CalorieEntryModel');
const moment = require('moment');
const { parseFoodText, getLoadingMessage } = require('../services/groq');

exports.addCalories = async (req, res) => {
  const { date } = req.body;

  const userId = req.user.id;
  const targetDate = date || moment().format('YYYY-MM-DD');

  try {
    // Use upsert: one entry per user per day
    const updated = await CalorieEntry.findOneAndUpdate(
      { user: userId, date: targetDate },
      { $set: { user: userId, date: targetDate } },
      { upsert: true, new: true }
    );

    res.json({ success: true, entryId: updated._id });
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
    const { parsed, rawResponse } = await parseFoodText(text);

    // Compute daily totals from items
    const mealItems = parsed.items.map(item => ({
      originalText: item.originalText,
      foodName: item.foodName,
      portion: item.portion,
      calories: item.calories || 0,
      protein: item.protein || 0,
      carbs: item.carbs || 0,
      fat: item.fat || 0,
      fiber: item.fiber || 0,
      sugar: item.sugar || 0,
    }));

    const dailyTotals = mealItems.reduce((acc, item) => {
      acc.calories += item.calories;
      acc.protein += item.protein;
      acc.carbs += item.carbs;
      acc.fat += item.fat;
      acc.fiber += item.fiber;
      acc.sugar += item.sugar;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 });

    await CalorieEntry.findByIdAndUpdate(entryId, {
      mealItems,
      dailyTotals,
    });

    res.json({ success: true, mealItems, dailyTotals, rawResponse });
  } catch (err) {
    console.error('processFoodText error:', err.message || err);
    res.status(500).json({
      message: `Failed to parse food text: ${err.message || 'Unknown error'}`,
      rawResponse: err.message || null,
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
      return res.json({ success: true, mealItems: [], dailyTotals: null });
    }

    res.json({
      success: true,
      date: entry.date,
      mealItems: entry.mealItems,
      dailyTotals: entry.dailyTotals,
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

    // Recompute daily totals
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
