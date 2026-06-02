const subscriptionService = require('../services/subscriptionService');

exports.subscribe = async (req, res) => {
  try {
    const subscriberId = req.user.userId;
    const { mentorId } = req.params;

    const subscription = await subscriptionService.subscribe(subscriberId, mentorId);
    res.status(201).json(subscription);
  } catch (err) {
    if (err.message === 'SELF_SUBSCRIPTION_NOT_ALLOWED') {
      return res.status(400).json({ error: '자신을 구독할 수 없습니다.' });
    }
    if (err.message === 'MENTOR_NOT_FOUND') {
      return res.status(404).json({ error: '해당 멘토를 찾을 수 없습니다.' });
    }
    if (err.message === 'ALREADY_SUBSCRIBED') {
      return res.status(400).json({ error: '이미 구독 중인 멘토입니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const subscriberId = req.user.userId;
    const { mentorId } = req.params;

    const result = await subscriptionService.unsubscribe(subscriberId, mentorId);
    res.status(200).json(result);
  } catch (err) {
    if (err.message === 'SUBSCRIPTION_NOT_FOUND') {
      return res.status(404).json({ error: '구독 정보를 찾을 수 없습니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

exports.getMySubscriptions = async (req, res) => {
  try {
    const subscriberId = req.user.userId;
    const subscriptions = await subscriptionService.getSubscriptions(subscriberId);
    res.status(200).json(subscriptions);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
