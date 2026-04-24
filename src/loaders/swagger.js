const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const config = require('../config');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LCAE API Documentation',
      version: '1.0.0',
      description: `
실시간 음성 방송 플랫폼 LCAE의 API 명세서입니다.

### 📢 Socket.IO 실시간 이벤트 명세
웹소켓 연결 후 사용할 수 있는 주요 이벤트입니다.

#### **[방송 관리]**
- **emit \`createBroadcast\`**: \`{ title: string }\`
  - 응답: \`{ success: true, broadcastId: string, rtpCapabilities: object }\`
- **emit \`joinBroadcast\`**: \`{ broadcastId: string }\`
  - 응답: \`{ success: true, rtpCapabilities: object }\`

#### **[WebRTC 송출/수신]**
- **emit \`createWebRtcTransport\`**: \`{ broadcastId: string }\`
- **emit \`connectWebRtcTransport\`**: \`{ broadcastId, transportId, dtlsParameters }\`
- **emit \`produce\`**: \`{ broadcastId, transportId, kind, rtpParameters }\`
- **emit \`consume\`**: \`{ broadcastId, transportId, producerId, rtpCapabilities }\`

#### **[AI 진행자 실시간 연동]**
- **AI 참여 시**: 호스트가 API를 호출하면 AI가 방에 접속하고, 모든 클라이언트는 새로운 오디오 트랙을 수신할 준비를 해야 합니다.
- **on \`newProducer\`**: AI가 목소리를 낼 때 서버에서 이 이벤트가 발생합니다. (\`producerId\`를 통해 AI 목소리 수신)
- **실시간 대화**: 호스트의 음성은 서버를 거쳐 AI에게 전달되며, AI의 응답은 방송방의 모든 인원에게 브로드캐스트됩니다.
      `,
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Local server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'apiKey',
          name: 'x-auth-token',
          in: 'header',
          description: 'JWT 토큰을 x-auth-token 헤더에 넣어주세요.',
        },
      },
    },
  },
  apis: ['./src/routes/*.js', './src/models/*.js'], // Path to the API docs
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
  console.log('✅ Swagger UI initialized at /api-docs');
};
