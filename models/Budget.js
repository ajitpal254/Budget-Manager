const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  limit: {
    type: Number,
    required: [true, 'Budget limit is required'],
    min: [0.01, 'Limit must be greater than zero']
  }
}, {
  timestamps: true
});

// Enforce unique categories per user
budgetSchema.index({ category: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
