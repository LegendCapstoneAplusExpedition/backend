const os = require('os');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

module.exports = {
  port: process.env.PORT || 3000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/myStreamDB',
  jwtSecret: process.env.JWT_SECRET || 'your_secret_key_here',
  mediasoup: {
    numWorkers: os.cpus().length,
    workerSettings: {
      logLevel: 'warn',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp'
      ],
      rtcMinPort: 40000,
      rtcMaxPort: 49999
    },
    routerOptions: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000
          }
        }
      ]
    },
    webRtcTransportOptions: {
      // MEDIASOUP_ANNOUNCED_IP 에 쉼표로 여러 IP를 넣으면 각각 ICE 후보로 알림.
      // 예) "127.0.0.1,192.168.45.19,211.117.243.101"
      //   → 로컬/LAN/인터넷 접속자가 각자 도달 가능한 경로를 자동 선택.
      listenIps: (process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((announcedIp) => ({
          ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
          announcedIp,
        })),
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302'
        }
      ]
    }
  }
};
