const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const loaders = require('./loaders');

async function startServer() {
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
    }
  });

  await loaders(app, io);

  const PORT = config.port;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();
