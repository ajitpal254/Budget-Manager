const mongoose = require('mongoose');

// A Web Push subscription for one of the user's devices. One document per
// (user, device) pair; the endpoint URL is globally unique per device.
const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  endpoint: {
    type: String,
    required: [true, 'Endpoint is required'],
    unique: true
  },
  keys: {
    p256dh: {
      type: String,
      required: [true, 'p256dh key is required']
    },
    auth: {
      type: String,
      required: [true, 'auth key is required']
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

pushSubscriptionSchema.index({ userId: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
