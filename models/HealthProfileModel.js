const mongoose = require('mongoose');

const healthProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  calorieGoals: {
    calorieTarget: { type: Number, default: 2000 },
    carbTarget: { type: Number, default: 200 },
    fatTarget: { type: Number, default: 80 },
    proteinTarget: { type: Number, default: 100 },
    sugarTarget: { type: Number, default: 50 },
  },
  healthProfile: {
    age: { type: Number },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    heightCm: { type: Number },
    weightKg: { type: Number },
    activityLevel: {
      type: String,
      enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
      default: 'moderate',
    },
    goal: {
      type: String,
      enum: ['lose', 'maintain', 'gain'],
      default: 'maintain',
    },
    targetWeightKg: { type: Number },
  },
}, { timestamps: true });

module.exports = mongoose.model('HealthProfile', healthProfileSchema);
