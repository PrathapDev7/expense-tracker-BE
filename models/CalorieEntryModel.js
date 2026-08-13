const mongoose = require('mongoose');

const calorieEntrySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'inprogress', 'success', 'failed'],
    default: 'pending',
  },
  foodText: {
    type: String,
    trim: true,
  },
  // Daily targets
  calorieTarget: { type: Number, default: 2000 },
  carbTarget: { type: Number, default: 200 },
  fatTarget: { type: Number, default: 80 },
  proteinTarget: { type: Number, default: 100 },
  sugarTarget: { type: Number, default: 50 },
  mealItems: [{
    originalText: { type: String, required: true, trim: true },
    foodName: { type: String, required: true, trim: true },
    portion: { type: String, trim: true },
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    fiber: { type: Number, default: 0 },
    sugar: { type: Number, default: 0 },
    mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], default: 'snack' },
    mealStatus: { type: String, enum: ['completed', 'inProgress', 'pending'], default: 'pending' },
  }],
  dailyTotals: {
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    fiber: { type: Number, default: 0 },
    sugar: { type: Number, default: 0 },
  },
}, { timestamps: true });

calorieEntrySchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('CalorieEntry', calorieEntrySchema);
