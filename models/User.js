const mongoose = require('mongoose');
const { isValidThresholds } = require('../lib/settings');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  passwordHash: {
    type: String,
    required: true
  },
  passwordSalt: {
    type: String,
    required: true
  },
  // PBKDF2 iteration count used for passwordHash. Stored so hashes can be
  // verified (and upgraded) if the iteration count changes in the future.
  hashIterations: {
    type: Number,
    default: 310000
  },
  // Per-user budget alert thresholds (percent of a category's budget limit).
  // Defaults mirror the app-wide 80/100 values; the settings UI and the
  // push-alert trigger read these, falling back to 80/100 when unset.
  settings: {
    type: {
      budgetWarningPct: {
        type: Number,
        default: 80,
        min: [1, 'Warning threshold must be at least 1'],
        max: [100, 'Warning threshold cannot exceed 100']
      },
      budgetDangerPct: {
        type: Number,
        default: 100,
        min: [1, 'Danger threshold must be at least 1'],
        max: [100, 'Danger threshold cannot exceed 100']
      }
    },
    default: () => ({}),
    validate: {
      validator: function (s) {
        return isValidThresholds(s && s.budgetWarningPct, s && s.budgetDangerPct);
      },
      message: 'Budget warning threshold must be less than the danger threshold.'
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
