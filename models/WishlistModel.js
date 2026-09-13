const mongoose = require('mongoose');

const WishlistItemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxLength: 120,
  },
  estimatedAmount: {
    type: Number,
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium',
  },
  category: {
    type: String,
    default: 'Other',
  },
  targetDate: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    default: '',
    maxLength: 500,
  },
  isPurchased: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('WishlistItem', WishlistItemSchema);
