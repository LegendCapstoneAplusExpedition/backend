const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
  title: { type: String, required: true },
  topic: { type: String, default: '' },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['live', 'ended'], default: 'live' },
  viewersCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Broadcast', broadcastSchema);
