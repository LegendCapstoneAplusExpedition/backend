const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const broadcastService = require('./broadcastService');
const config = require('../config');

// AI 에이전트 관리용 (Map: broadcastId -> AgentInfo)
const activeAgents = new Map();

/**
 * AI 에이전트 시작
 */
async function startAIAgent(broadcastId) {
  if (activeAgents.has(broadcastId)) {
    throw new Error('AI Agent is already running for this broadcast');
  }

  const room = broadcastService.rooms.get(broadcastId);
  if (!room) throw new Error('Broadcast room not found');

  console.log(`[AI] Starting Agent for broadcast: ${broadcastId}`);

  // 1. Python 프로세스 실행 (AI 에이전트 서버 모드)
  const pythonPath = 'python3'; // 또는 환경에 맞는 파이썬 경로
  const scriptPath = path.join(__dirname, '../ai-module/main.py');
  
  // AI 서버 포트를 동적으로 할당하거나 고정할 수 있습니다 (여기서는 8765 사용)
  const aiPort = 8765;
  const pythonProcess = spawn(pythonPath, [
    scriptPath,
    '--mode', 'server',
    '--port', aiPort.toString()
  ]);

  pythonProcess.stdout.on('data', (data) => console.log(`[AI-Py-Out]: ${data}`));
  pythonProcess.stderr.on('data', (data) => console.error(`[AI-Py-Err]: ${data}`));

  // 2. AI 음성 송출을 위한 Mediasoup Producer 준비 (DirectTransport 활용)
  // AI의 TTS 결과를 이 Producer를 통해 방송방으로 보냅니다.
  const aiTransport = await room.router.createDirectTransport();
  const aiProducer = await aiTransport.produce({
    kind: 'audio',
    rtpParameters: {
      codecs: [{
        mimeType: 'audio/opus',
        payloadType: 101,
        clockRate: 48000,
        channels: 2
      }],
      encodings: [{ ssrc: 11111111 }]
    }
  });

  // 3. AI 에이전트와 연결 (WebSocket Bridge)
  // 약간의 지연 후 Python 서버가 준비되면 연결
  setTimeout(() => {
    setupBridge(broadcastId, aiPort, aiTransport, aiProducer);
  }, 3000);

  activeAgents.set(broadcastId, {
    pythonProcess,
    aiProducer,
    aiTransport,
    status: 'starting'
  });

  return { success: true, message: 'AI Agent starting...' };
}

/**
 * 오디오 브릿지 설정 (Node.js <-> AI Agent)
 */
function setupBridge(broadcastId, aiPort, aiTransport, aiProducer) {
  const sttWs = new WebSocket(`ws://localhost:${aiPort}`);
  
  sttWs.on('open', () => {
    console.log(`[AI] Connected to AI STT Server for ${broadcastId}`);
    const agent = activeAgents.get(broadcastId);
    if (agent) agent.status = 'connected';
  });

  // AI TTS 음성 수신 시 Mediasoup으로 송출
  // AI 팀의 코드에서 TTS 결과를 다시 백엔드로 보내는 로직과 연동 필요
  // (현재 AI 팀 코드는 tts_ws_uri로 연결하여 음성을 보냄)
  sttWs.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      // AI로부터 온 PCM 데이터를 RTP(Opus)로 변환하여 송출하는 로직이 여기에 들어갑니다.
      // (현 단계에서는 구조적 연결에 집중)
      // aiTransport.send(data); 
    }
  });

  sttWs.on('error', (err) => console.error(`[AI] Bridge Error: ${err.message}`));
}

/**
 * AI 에이전트 중지
 */
async function stopAIAgent(broadcastId) {
  const agent = activeAgents.get(broadcastId);
  if (!agent) return;

  console.log(`[AI] Stopping Agent for broadcast: ${broadcastId}`);
  
  if (agent.pythonProcess) {
    agent.pythonProcess.kill();
  }
  
  if (agent.aiProducer) {
    agent.aiProducer.close();
  }

  activeAgents.delete(broadcastId);
  return { success: true };
}

module.exports = {
  startAIAgent,
  stopAIAgent
};
