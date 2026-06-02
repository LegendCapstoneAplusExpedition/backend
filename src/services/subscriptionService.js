const Subscription = require('../models/Subscription');
const User = require('../models/User');

exports.subscribe = async (subscriberId, mentorId) => {
  if (subscriberId === mentorId) {
    throw new Error('SELF_SUBSCRIPTION_NOT_ALLOWED');
  }

  // 멘토가 존재하는지 확인
  const mentor = await User.findById(mentorId);
  if (!mentor) {
    throw new Error('MENTOR_NOT_FOUND');
  }

  try {
    const subscription = new Subscription({
      subscriberId,
      mentorId
    });
    return await subscription.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new Error('ALREADY_SUBSCRIBED');
    }
    throw err;
  }
};

exports.unsubscribe = async (subscriberId, mentorId) => {
  const result = await Subscription.findOneAndDelete({
    subscriberId,
    mentorId
  });

  if (!result) {
    throw new Error('SUBSCRIPTION_NOT_FOUND');
  }

  return { message: 'Unsubscribed successfully' };
};

exports.getSubscriptions = async (subscriberId) => {
  return await Subscription.find({ subscriberId })
    .populate('mentorId', 'username createdAt')
    .sort({ createdAt: -1 });
};
