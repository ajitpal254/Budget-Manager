const mongoose = require('mongoose');

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'yearly'];

const recurringTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: {
      values: ['income', 'expense'],
      message: '{VALUE} is not a valid transaction type'
    }
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [100, 'Description cannot exceed 100 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than zero']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  frequency: {
    type: String,
    required: [true, 'Frequency is required'],
    enum: {
      values: FREQUENCIES,
      message: '{VALUE} is not a valid frequency'
    }
  },
  nextRunDate: {
    type: Date,
    required: [true, 'Next run date is required']
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// The due-check always queries by user and next run date.
recurringTransactionSchema.index({ userId: 1, nextRunDate: 1 });

const RecurringTransaction = mongoose.model('RecurringTransaction', recurringTransactionSchema);

module.exports = RecurringTransaction;
module.exports.FREQUENCIES = FREQUENCIES;
