const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Goal name is required'],
    trim: true,
    maxlength: [100, 'Goal name cannot exceed 100 characters']
  },
  target: {
    type: Number,
    required: [true, 'Target amount is required'],
    min: [0.01, 'Target must be greater than zero']
  },
  current: {
    type: Number,
    default: 0,
    min: [0, 'Current savings cannot be negative']
  },
  deadline: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Goal', goalSchema);
