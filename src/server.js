const app = require('./app');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const config = require('./config');
const loaders = require('./loaders');

function createHttpServer() {
  // 인증서 경로: 환경변수 우선, 없으면 ../certs 기본 경로
  const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, '../certs/cert.pem');
  const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, '../certs/key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const server = https.createServer({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    }, app);
    console.log(`🔐 HTTPS enabled (cert: ${certPath})`);
    return { server, protocol: 'https' };
  }

  console.warn(`⚠️  SSL cert not found, falling back to HTTP. (looked for: ${certPath})`);
  return { server: http.createServer(app), protocol: 'http' };
}

async function startServer() {
  const { server, protocol } = createHttpServer();
  const io = new Server(server, {
    cors: {
      origin: '*',
    }
  });

  await loaders(app, io);

  const PORT = config.port;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on ${protocol}://localhost:${PORT}`);
  });
}

startServer();
