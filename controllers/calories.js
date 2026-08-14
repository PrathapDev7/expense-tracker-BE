const CalorieEntry = require('../models/CalorieEntryModel');
const WeightEntry = require('../models/WeightEntryModel');
const HealthProfile = require('../models/HealthProfileModel');
const moment = require('moment');
const { processEntry, calculateCalorieGoals } = require('../services/groq');

const DEFAULT_GOALS = { calorieTarget: 2000, carbTarget: 200, fatTarget: 80, proteinTarget: 100, sugarTarget: 50 };

exports.addCalories = async (req, res) => {
  const { date } = req.body;

  const userId = req.user.id;
  const targetDate = date || moment().format('YYYY-MM-DD');

  try {
    const profile = await HealthProfile.findOne({ user: userId }).lean();
    const goals = profile?.calorieGoals || DEFAULT_GOALS;

    const updated = await CalorieEntry.findOneAndUpdate(
      { user: userId, date: targetDate },
      {
        $set: { user: userId, date: targetDate, status: 'pending' },
        $setOnInsert: {
          calorieTarget: goals.calorieTarget ?? DEFAULT_GOALS.calorieTarget,
          carbTarget: goals.carbTarget ?? DEFAULT_GOALS.carbTarget,
          fatTarget: goals.fatTarget ?? DEFAULT_GOALS.fatTarget,
          proteinTarget: goals.proteinTarget ?? DEFAULT_GOALS.proteinTarget,
          sugarTarget: goals.sugarTarget ?? DEFAULT_GOALS.sugarTarget,
        },
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, entryId: updated._id, status: updated.status });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.processFoodText = async (req, res) => {
  const { entryId, text, localHour } = req.body;

  if (!entryId || !text || !text.trim()) {
    return res.status(400).json({ message: 'Missing entryId or text.' });
  }

  try {
    const result = await processEntry(entryId, text, localHour);
    res.json({ success: true, ...result, status: 'success' });
  } catch (err) {
    // processEntry already recorded a pending placeholder + 'failed' status for
    // /health to retry — never surface this as an error to the user.
    console.error('processFoodText error:', err.message || err);
    res.json({
      success: true,
      status: 'pending',
      addedItems: [],
      message: 'We had trouble analyzing that just now — nutrition data will be added shortly.',
    });
  }
};

exports.updateCalorieGoals = async (req, res) => {
  const { calorieTarget, carbTarget, fatTarget, proteinTarget, sugarTarget, date } = req.body;
  const userId = req.user.id;

  const goals = {};
  if (calorieTarget != null) goals.calorieTarget = calorieTarget;
  if (carbTarget != null) goals.carbTarget = carbTarget;
  if (fatTarget != null) goals.fatTarget = fatTarget;
  if (proteinTarget != null) goals.proteinTarget = proteinTarget;
  if (sugarTarget != null) goals.sugarTarget = sugarTarget;

  if (Object.keys(goals).length === 0) {
    return res.status(400).json({ message: 'No goal fields provided.' });
  }

  try {
    const profile = await HealthProfile.findOneAndUpdate(
      { user: userId },
      { $set: Object.fromEntries(Object.entries(goals).map(([k, v]) => [`calorieGoals.${k}`, v])) },
      { new: true, upsert: true }
    ).lean();

    // Keep the current day's entry in sync so the UI reflects the change immediately.
    const targetDate = date || moment().format('YYYY-MM-DD');
    await CalorieEntry.findOneAndUpdate({ user: userId, date: targetDate }, { $set: goals });

    res.json({ success: true, calorieGoals: profile.calorieGoals });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getDailyCalories = async (req, res) => {
  const { date } = req.query;
  const userId = req.user.id;
  const targetDate = date || moment().format('YYYY-MM-DD');

  try {
    const entry = await CalorieEntry.findOne({ user: userId, date: targetDate }).lean();
    const profile = await HealthProfile.findOne({ user: userId }).lean();
    const goals = profile?.calorieGoals || DEFAULT_GOALS;
    const healthProfile = profile?.healthProfile || null;

    if (!entry || entry.mealItems.length === 0) {
      return res.json({
        success: true,
        mealItems: [],
        dailyTotals: null,
        status: 'pending',
        dailyTargets: {
          calorieTarget: goals.calorieTarget ?? DEFAULT_GOALS.calorieTarget,
          carbTarget: goals.carbTarget ?? DEFAULT_GOALS.carbTarget,
          fatTarget: goals.fatTarget ?? DEFAULT_GOALS.fatTarget,
          proteinTarget: goals.proteinTarget ?? DEFAULT_GOALS.proteinTarget,
          sugarTarget: goals.sugarTarget ?? DEFAULT_GOALS.sugarTarget,
        },
        healthProfile,
      });
    }

    res.json({
      success: true,
      date: entry.date,
      mealItems: entry.mealItems,
      dailyTotals: entry.dailyTotals,
      status: entry.status,
      dailyTargets: {
        calorieTarget: entry.calorieTarget ?? goals.calorieTarget ?? DEFAULT_GOALS.calorieTarget,
        carbTarget: entry.carbTarget ?? goals.carbTarget ?? DEFAULT_GOALS.carbTarget,
        fatTarget: entry.fatTarget ?? goals.fatTarget ?? DEFAULT_GOALS.fatTarget,
        proteinTarget: entry.proteinTarget ?? goals.proteinTarget ?? DEFAULT_GOALS.proteinTarget,
        sugarTarget: entry.sugarTarget ?? goals.sugarTarget ?? DEFAULT_GOALS.sugarTarget,
      },
      healthProfile,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.calculateGoals = async (req, res) => {
  const { age, gender, heightCm, weightKg, activityLevel, goal } = req.body;
  const userId = req.user.id;

  if (!age || !gender || !heightCm || !weightKg) {
    return res.status(400).json({ message: 'age, gender, heightCm and weightKg are required.' });
  }

  const healthProfile = {
    age,
    gender,
    heightCm,
    weightKg,
    activityLevel: activityLevel || 'moderate',
    goal: goal || 'maintain',
  };

  try {
    await HealthProfile.findOneAndUpdate(
      { user: userId },
      { $set: { healthProfile } },
      { upsert: true }
    );
    const calorieGoals = await calculateCalorieGoals(healthProfile);
    res.json({ success: true, calorieGoals, healthProfile });
  } catch (err) {
    console.error('calculateGoals error:', err.message || err);
    res.status(500).json({ message: `Failed to calculate goals: ${err.message || 'Unknown error'}` });
  }
};

exports.getCalorieHistory = async (req, res) => {
  const userId = req.user.id;
  const to = req.query.to || moment().format('YYYY-MM-DD');
  const from = req.query.from || moment(to).subtract(6, 'days').format('YYYY-MM-DD');

  try {
    const entries = await CalorieEntry.find({
      user: userId,
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .lean();

    const days = entries.map(e => ({
      date: e.date,
      calories: e.dailyTotals?.calories || 0,
      protein: e.dailyTotals?.protein || 0,
      carbs: e.dailyTotals?.carbs || 0,
      fat: e.dailyTotals?.fat || 0,
      sugar: e.dailyTotals?.sugar || 0,
      calorieTarget: e.calorieTarget,
    }));

    res.json({ success: true, from, to, days });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.addWeightEntry = async (req, res) => {
  const { weightKg, date } = req.body;
  const userId = req.user.id;
  const targetDate = date || moment().format('YYYY-MM-DD');

  if (!weightKg || weightKg <= 0) {
    return res.status(400).json({ message: 'A valid weightKg is required.' });
  }

  try {
    const entry = await WeightEntry.findOneAndUpdate(
      { user: userId, date: targetDate },
      { $set: { weightKg } },
      { upsert: true, new: true }
    );
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getWeightHistory = async (req, res) => {
  const userId = req.user.id;
  const to = req.query.to || moment().format('YYYY-MM-DD');
  const from = req.query.from || moment(to).subtract(89, 'days').format('YYYY-MM-DD');

  try {
    const entries = await WeightEntry.find({
      user: userId,
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .lean();
    const profile = await HealthProfile.findOne({ user: userId }).lean();

    res.json({
      success: true,
      from,
      to,
      entries,
      targetWeightKg: profile?.healthProfile?.targetWeightKg ?? null,
      currentWeightKg: profile?.healthProfile?.weightKg ?? null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.deleteWeightEntry = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const entry = await WeightEntry.findOneAndDelete({ _id: id, user: userId });
    if (!entry) return res.status(404).json({ message: 'Entry not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.updateTargetWeight = async (req, res) => {
  const { targetWeightKg } = req.body;
  const userId = req.user.id;

  if (!targetWeightKg || targetWeightKg <= 0) {
    return res.status(400).json({ message: 'A valid targetWeightKg is required.' });
  }

  try {
    const profile = await HealthProfile.findOneAndUpdate(
      { user: userId },
      { $set: { 'healthProfile.targetWeightKg': targetWeightKg } },
      { new: true, upsert: true }
    ).lean();
    res.json({ success: true, targetWeightKg: profile.healthProfile?.targetWeightKg ?? null });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.deleteMealItem = async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user.id;

  try {
    const entry = await CalorieEntry.findOne({ user: userId, 'mealItems._id': itemId });
    if (!entry) return res.status(404).json({ message: 'Item not found.' });

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
