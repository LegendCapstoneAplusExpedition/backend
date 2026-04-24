const Broadcast = require('../models/Broadcast');
const { createRouter } = require('../loaders/mediasoup');
const config = require('../config');

// In-memory storage for mediasoup objects
// Map: broadcastId -> { router, transports, producers, consumers }
const rooms = new Map();

/**
 * Creates a new broadcast session.
 */
async function createBroadcast(title, userId) {
  // 1. Create DB record
  const broadcast = new Broadcast({
    title,
    host: userId,
    status: 'live',
  });
  await broadcast.save();

  // 2. Create mediasoup router
  const router = await createRouter();

  // 3. Initialize room state
  rooms.set(broadcast._id.toString(), {
    router,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  });

  return {
    broadcastId: broadcast._id.toString(),
    rtpCapabilities: router.rtpCapabilities,
  };
}

/**
 * Join an existing broadcast.
 */
async function joinBroadcast(broadcastId) {
  const room = rooms.get(broadcastId);
  if (!room) {
    throw new Error('Broadcast not found or not live');
  }

  // Update viewer count in DB
  await Broadcast.findByIdAndUpdate(broadcastId, { $inc: { viewersCount: 1 } });

  return {
    rtpCapabilities: room.router.rtpCapabilities,
  };
}

/**
 * Create WebRtcTransport for a broadcast.
 */
async function createWebRtcTransport(broadcastId, socketId) {
  const room = rooms.get(broadcastId);
  if (!room) throw new Error('Room not found');

  const {
    listenIps,
    initialAvailableOutgoingBitrate,
    minimumAvailableOutgoingBitrate,
    maxSctpMessageSize,
    iceServers,
  } = config.mediasoup.webRtcTransportOptions;

  const transport = await room.router.createWebRtcTransport({
    listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate,
    enableSctp: true,
    numSctpStreams: { OS: 1024, MIS: 1024 },
    maxSctpMessageSize: maxSctpMessageSize || 262144,
  });

  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed') {
      transport.close();
    }
  });

  transport.on('close', () => {
    console.log(`[mediasoup] transport closed [id:${transport.id}]`);
  });

  // Store transport in room
  room.transports.set(transport.id, transport);

  return {
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
      iceServers: iceServers || [],
    }
  };
}

/**
 * Get all live broadcasts.
 */
async function getLiveBroadcasts() {
  return await Broadcast.find({ status: 'live' })
    .populate('host', 'username')
    .sort({ createdAt: -1 });
}

/**
 * End a broadcast.
 */
async function endBroadcast(broadcastId, userId) {
  const broadcast = await Broadcast.findById(broadcastId);
  if (!broadcast) throw new Error('Broadcast not found');
  
  // Verify host if userId is provided (for API calls)
  if (userId && broadcast.host.toString() !== userId.toString()) {
    throw new Error('Unauthorized: Only host can end broadcast');
  }

  // 1. Update DB status
  broadcast.status = 'ended';
  await broadcast.save();

  // 2. Cleanup mediasoup resources
  const room = rooms.get(broadcastId);
  if (room) {
    // Close router (this also closes all associated transports/producers/consumers)
    room.router.close();
    rooms.delete(broadcastId);
  }

  return { success: true };
}

module.exports = {
  createBroadcast,
  joinBroadcast,
  createWebRtcTransport,
  getLiveBroadcasts,
  endBroadcast,
  rooms,
};
