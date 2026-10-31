const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: {
      values: ['income', 'expense'],
      message: '{VALUE} is not a valid transaction type'
    }
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  date: {
    type: Date,
    default: Date.now
  },
  // Optional receipt photo, embedded on the document (Render's disk is
  // ephemeral, so there is nowhere else to put it). `data` is excluded
  // from query results by default so list endpoints never pull image
  // bytes; only `contentType` is visible, which is enough for the UI to
  // show a "has receipt" badge.
  receipt: {
    data: {
      type: Buffer,
      select: false
    },
    contentType: {
      type: String
    }
  }
}, {
  timestamps: true
});

// The list views always query by user and sort newest-first.
transactionSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
