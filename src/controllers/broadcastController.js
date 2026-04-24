const broadcastService = require('../services/broadcastService');

/**
 * Get all live broadcasts.
 */
async function getLiveBroadcasts(req, res) {
  try {
    const broadcasts = await broadcastService.getLiveBroadcasts();
    res.json(broadcasts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * End a broadcast.
 */
async function endBroadcast(req, res) {
  try {
    const result = await broadcastService.endBroadcast(req.params.id, req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  getLiveBroadcasts,
  endBroadcast,
};
