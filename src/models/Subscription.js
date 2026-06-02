const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  subscriberId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  mentorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// 동일한 사용자가 동일한 멘토를 중복 구독하는 것을 방지
subscriptionSchema.index({ subscriberId: 1, mentorId: 1 }, { unique: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
