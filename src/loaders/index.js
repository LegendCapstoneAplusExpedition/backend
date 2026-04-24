const mongooseLoader = require('./mongoose');
const expressLoader = require('./express');
const mediasoupLoader = require('./mediasoup');
const socketLoader = require('./socket');
const Broadcast = require('../models/Broadcast');

module.exports = async (expressApp, io) => {
  // 1. Initialize MongoDB
  await mongooseLoader();

  // 2. Initialize Mediasoup workers
  await mediasoupLoader.createWorkers();

  // 3. Clear old 'live' broadcasts
  console.info('[bootstrap] Cleaning up old live broadcasts...');
  await Broadcast.updateMany({ status: 'live' }, { status: 'ended' });

  // 4. Initialize Express
  expressLoader(expressApp);

  // 5. Initialize Socket.IO
  socketLoader(io);

  console.log('✅ All loaders initialized');
};
