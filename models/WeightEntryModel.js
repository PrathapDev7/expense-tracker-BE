const mongoose = require('mongoose');

const weightEntrySchema = new mongoose.Schema({
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
  weightKg: {
    type: Number,
    required: true,
  },
}, { timestamps: true });

weightEntrySchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('WeightEntry', weightEntrySchema);
