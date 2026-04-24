const socketHandler = require('../socket');

module.exports = (io) => {
  socketHandler(io);
  console.log('✅ Socket.IO initialized');
};
