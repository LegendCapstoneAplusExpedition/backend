const jwt = require('jsonwebtoken');
const config = require('../config');
const broadcastService = require('../services/broadcastService');
const Chat = require('../models/Chat');
const Broadcast = require('../models/Broadcast');

module.exports = (io) => {
  // Authentication Middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers['x-auth-token'];
    
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[socket] User connected: ${socket.username} (${socket.id})`);

    // --- 1. Broadcast Session Management ---

    socket.on('createBroadcast', async ({ title }, callback) => {
      try {
        const data = await broadcastService.createBroadcast(title, socket.userId);
        socket.join(data.broadcastId);
        
        socket.broadcastId = data.broadcastId;
        socket.isHost = true;

        callback({ success: true, ...data });
      } catch (err) {
        console.error('Create broadcast failed:', err);
        callback({ success: false, error: err.message });
      }
    });

    socket.on('joinBroadcast', async ({ broadcastId }, callback) => {
      try {
        const data = await broadcastService.joinBroadcast(broadcastId);
        socket.join(broadcastId);
        
        socket.broadcastId = broadcastId;
        socket.isHost = false;

        callback({ success: true, ...data });
      } catch (err) {
        console.error('Join broadcast failed:', err);
        callback({ success: false, error: err.message });
      }
    });

    // --- 2. WebRTC Signaling ---

    socket.on('createWebRtcTransport', async ({ broadcastId }, callback) => {
      try {
        const transportData = await broadcastService.createWebRtcTransport(broadcastId, socket.id);
        callback({ success: true, ...transportData });
      } catch (err) {
        console.error('Create transport failed:', err);
        callback({ success: false, error: err.message });
      }
    });

    socket.on('connectWebRtcTransport', async ({ broadcastId, transportId, dtlsParameters }, callback) => {
      try {
        const room = broadcastService.rooms.get(broadcastId);
        const transport = room.transports.get(transportId);
        await transport.connect({ dtlsParameters });
        callback({ success: true });
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('produce', async ({ broadcastId, transportId, kind, rtpParameters }, callback) => {
      try {
        if (!socket.isHost) throw new Error('Unauthorized: Only host can produce');

        const room = broadcastService.rooms.get(broadcastId);
        const transport = room.transports.get(transportId);
        const producer = await transport.produce({ kind, rtpParameters });

        room.producers.set(producer.id, producer);
        
        socket.to(broadcastId).emit('newProducer', { producerId: producer.id });

        callback({ success: true, producerId: producer.id });
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('consume', async ({ broadcastId, transportId, producerId, rtpCapabilities }, callback) => {
      try {
        const room = broadcastService.rooms.get(broadcastId);
        const transport = room.transports.get(transportId);

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          throw new Error('Cannot consume');
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
        });

        room.consumers.set(consumer.id, consumer);

        callback({
          success: true,
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('resumeConsumer', async ({ broadcastId, consumerId }, callback) => {
      try {
        const room = broadcastService.rooms.get(broadcastId);
        const consumer = room.consumers.get(consumerId);
        await consumer.resume();
        callback({ success: true });
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    // --- 3. Real-time Chat ---

    socket.on('sendChat', async ({ message }) => {
      if (!socket.broadcastId) return;

      try {
        const chat = new Chat({
          broadcast: socket.broadcastId,
          user: socket.userId,
          username: socket.username,
          message: message,
        });
        await chat.save();

        io.to(socket.broadcastId).emit('receiveChat', {
          username: socket.username,
          message: message,
          createdAt: chat.createdAt,
        });
      } catch (err) {
        console.error('Chat failed:', err);
      }
    });

    // --- 4. Disconnect Handling ---

    socket.on('disconnect', async () => {
      console.log(`[socket] User disconnected: ${socket.username} (${socket.id})`);
      
      if (socket.broadcastId) {
        if (socket.isHost) {
          try {
            await broadcastService.endBroadcast(socket.broadcastId);
            io.to(socket.broadcastId).emit('broadcastEnded');
          } catch (err) {
            console.error('Error during host disconnect cleanup:', err);
          }
        } else {
          await Broadcast.findByIdAndUpdate(socket.broadcastId, { $inc: { viewersCount: -1 } });
        }
      }
    });
  });
};
