const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const dgram = require('dgram');
const WebSocket = require('ws');
const broadcastService = require('./broadcastService');
const Broadcast = require('../models/Broadcast');

const activeAgents = new Map();

// OS가 할당하는 빈 포트를 얻는다. 동시 방송이 같은 포트(8765)에 충돌하지 않도록
// 방송마다 고유 포트로 Python STT 서버를 띄운다.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startAIAgent(broadcastId) {
  if (activeAgents.has(broadcastId)) {
    throw new Error('AI Agent is already running for this broadcast');
  }

  const room = broadcastService.rooms.get(broadcastId);
  if (!room) throw new Error('Broadcast room not found');

  // 방송 제목을 AI 주제로 전달 (LLM 환각 감소)
  let broadcastTopic = '';
  try {
    const broadcast = await Broadcast.findById(broadcastId).select('title').lean();
    if (broadcast && broadcast.title) broadcastTopic = broadcast.title;
  } catch (err) {
    console.error(`[AI] 방송 제목 조회 실패: ${err.message}`);
  }

  console.log(`[AI] Starting Agent for broadcast: ${broadcastId}${broadcastTopic ? ` (주제: ${broadcastTopic})` : ''}`);

  // 1. Python 프로세스 실행
  const isWindows = os.platform() === 'win32';
  const pythonPath = isWindows
    ? path.join(__dirname, '../ai-module/venv/Scripts/python.exe')
    : path.join(__dirname, '../ai-module/.venv/bin/python');
  const scriptPath = path.join(__dirname, '../ai-module/main.py');
  const aiPort = await getFreePort();  // 방송별 고유 포트 (동시 방송 충돌 방지)
  console.log(`[AI] Allocated STT port ${aiPort} for broadcast ${broadcastId}`);

  const pythonArgs = [
    scriptPath,
    '--mode', 'server',
    '--port', aiPort.toString(),
  ];
  if (broadcastTopic) {
    pythonArgs.push('--topic', broadcastTopic);
  }

  const pythonProcess = spawn(pythonPath, pythonArgs, {
    env: {
      ...process.env,
      BROADCAST_ID: broadcastId,
      BROADCAST_TOPIC: broadcastTopic,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    },
  });

  pythonProcess.stdout.setEncoding('utf-8');
  pythonProcess.stderr.setEncoding('utf-8');

  // 동시 방송 시 로그가 뒤섞이지 않도록 방송ID·포트로 줄 단위 태깅한다.
  // (한 data 청크에 여러 줄이 와도 각 줄에 접두사를 붙여 grep/필터 가능)
  const logTag = `AI ${broadcastId}:${aiPort}`;
  const emitLines = (data, isErr) => {
    for (const line of data.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      // torch.hub 캐시 안내("Using cache found in")는 stderr지만 오류가 아니다.
      if (isErr && !line.includes('Using cache found in')) {
        console.error(`[${logTag}] ${line}`);
      } else {
        console.log(`[${logTag}] ${line}`);
      }
    }
  };

  pythonProcess.stdout.on('data', (data) => emitLines(data, false));
  pythonProcess.stderr.on('data', (data) => emitLines(data, true));

  // 2. AI 음성 송출을 위한 DirectTransport
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
  room.producers.set(aiProducer.id, aiProducer);

  const agent = {
    broadcastId,
    aiPort,
    pythonProcess,
    aiProducer,
    aiTransport,
    status: 'starting',
    bridge: null,
    sttWs: null
  };
  activeAgents.set(broadcastId, agent);

  pythonProcess.on('exit', (code, signal) => {
    console.log(`[AI] Python process exited (code=${code}, signal=${signal}) for ${broadcastId}`);
    const currentAgent = activeAgents.get(broadcastId);
    if (currentAgent) {
      currentAgent.pythonProcess = null;
      stopAIAgent(broadcastId);
    }
  });

  // 3. WebSocket 연결 시도
  const MAX_RETRIES = 10;
  let retryCount = 0;

  function attemptBridgeConnection() {
    if (!activeAgents.has(broadcastId)) return;

    const sttWs = new WebSocket(`ws://localhost:${aiPort}`);
    agent.sttWs = sttWs;
    
    sttWs.on('open', () => {
      console.log(`[AI] Connected to AI STT Server for ${broadcastId}`);
      agent.status = 'connected';
      setupBridgeHandlers(broadcastId);
    });

    sttWs.on('error', (err) => {
      console.error(`[AI] STT WebSocket error: ${err.message || err.code || String(err)}`);
      if (retryCount < MAX_RETRIES && agent.status === 'starting') {
        retryCount++;
        setTimeout(attemptBridgeConnection, 2000);
      }
    });

    sttWs.on('close', () => {
      console.log(`[AI] STT WebSocket closed for ${broadcastId}`);
      if (agent.bridge) {
        agent.bridge.cleanup();
        agent.bridge = null;
      }
    });
  }

  attemptBridgeConnection();

  return { success: true, aiProducerId: aiProducer.id };
}

async function setupBridgeHandlers(broadcastId) {
  const agent = activeAgents.get(broadcastId);
  const room = broadcastService.rooms.get(broadcastId);
  if (!agent || !room || !agent.sttWs || agent.sttWs.readyState !== WebSocket.OPEN) return;

  // 기존 브리지 정리
  if (agent.bridge) {
    console.log(`[AI] Cleaning up existing bridge for ${broadcastId}`);
    agent.bridge.cleanup();
    agent.bridge = null;
  }

  // 1. 호스트 오디오 Producer 찾기
  let hostAudioProducer = null;
  for (const producer of room.producers.values()) {
    if (producer.kind === 'audio' && producer.id !== agent.aiProducer.id) {
      hostAudioProducer = producer;
      break;
    }
  }

  if (!hostAudioProducer) {
    console.log(`[AI] No host audio producer found yet for ${broadcastId}`);
    return;
  }

  console.log(`[AI] Setting up bridge for host producer: ${hostAudioProducer.id}`);

  try {
    // 2. STT를 위한 PlainTransport 생성
    const sttTransport = await room.router.createPlainTransport({
      listenIp: '127.0.0.1',
      rtcpMux: true,
      comedia: false
    });

    const rtpPort = 5004 + Math.floor(Math.random() * 10000);
    
    await sttTransport.connect({
      ip: '127.0.0.1',
      port: rtpPort
    });

    const sttConsumer = await sttTransport.consume({
      producerId: hostAudioProducer.id,
      rtpCapabilities: room.router.rtpCapabilities,
      paused: false
    });

    const payloadType = sttConsumer.rtpParameters.codecs[0].payloadType;
    const sdpContent = [
      'v=0',
      'o=- 0 0 IN IP4 127.0.0.1',
      's=Mediasoup',
      'c=IN IP4 127.0.0.1',
      't=0 0',
      `m=audio ${rtpPort} RTP/AVP ${payloadType}`,
      `a=rtpmap:${payloadType} opus/48000/2`
    ].join('\n') + '\n';

    const sdpPath = path.join(os.tmpdir(), `mediasoup-stt-${sttConsumer.id}.sdp`);
    fs.writeFileSync(sdpPath, sdpContent);

    // FFmpeg 실행 (STT용: RTP -> PCM)
    const ffmpegSTT = spawn('ffmpeg', [
      '-protocol_whitelist', 'pipe,rtp,udp,file',
      '-analyzeduration', '0',
      '-probesize', '32',
      '-i', sdpPath,
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ac', '1',
      '-ar', '16000',
      'pipe:1'
    ]);

    ffmpegSTT.stdout.on('data', (pcmData) => {
      if (agent.sttWs && agent.sttWs.readyState === WebSocket.OPEN) {
        agent.sttWs.send(pcmData);
      }
    });

    ffmpegSTT.on('error', (err) => console.error(`[AI] FFmpeg STT Error: ${err.message}`));

    // 3. TTS를 위한 FFmpeg 설정 (PCM -> RTP/Opus)
    const ttsRtpPort = 6004 + Math.floor(Math.random() * 10000);
    const ffmpegTTS = spawn('ffmpeg', [
      '-re',
      '-f', 's16le',
      '-ar', '24000',
      '-ac', '1',
      '-i', 'pipe:0',
      '-acodec', 'libopus',
      '-ab', '64k',
      '-ar', '48000',
      '-ac', '2',
      '-ssrc', '11111111',
      '-payload_type', '101',
      '-f', 'rtp',
      `rtp://127.0.0.1:${ttsRtpPort}`
    ]);

    ffmpegTTS.on('error', (err) => console.error(`[AI] FFmpeg TTS Error: ${err.message}`));
    ffmpegTTS.stderr.on('data', (d) => {
      const m = d.toString();
      if (m.toLowerCase().includes('error')) console.error(`[AI] FFmpeg TTS: ${m.trim()}`);
    });

    const ttsUdpSocket = dgram.createSocket('udp4');
    ttsUdpSocket.on('error', (err) => console.error(`[AI] TTS UDP Socket Error: ${err.message}`));

    ttsUdpSocket.bind(ttsRtpPort, '127.0.0.1');
    ttsUdpSocket.on('message', (packet) => {
      try {
        if (agent.aiProducer && !agent.aiProducer.closed) {
          agent.aiProducer.send(packet);
        }
      } catch (err) {
        console.error(`[AI] aiProducer.send failed: ${err.message}`);
      }
    });

    const onMessage = (data) => {
      if (Buffer.isBuffer(data)) {
        if (ffmpegTTS.stdin.writable) {
          ffmpegTTS.stdin.write(data);
        }
      } else if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'status' && global.io) {
            console.log(`[AI] Status Change for ${broadcastId}: ${msg.value}`);
            global.io.to(broadcastId).emit('ai_status', { state: msg.value });
          }
        } catch (err) {
          console.error(`[AI] Failed to parse WebSocket message: ${err.message}`);
        }
      }
    };
    agent.sttWs.on('message', onMessage);

    const cleanup = () => {
      console.log(`[AI] Bridge cleanup triggered for ${broadcastId}`);
      if (agent.sttWs) agent.sttWs.removeListener('message', onMessage);
      if (!ffmpegSTT.killed) ffmpegSTT.kill('SIGKILL');
      if (!ffmpegTTS.killed) ffmpegTTS.kill('SIGKILL');
      if (!sttTransport.closed) sttTransport.close();
      try { ttsUdpSocket.close(); } catch (e) {}
      if (fs.existsSync(sdpPath)) {
          try { fs.unlinkSync(sdpPath); } catch (e) {}
      }
    };

    agent.bridge = { cleanup, hostProducerId: hostAudioProducer.id };
    sttConsumer.on('producerclose', () => {
        console.log(`[AI] Host producer closed, cleaning up bridge`);
        cleanup();
        agent.bridge = null;
    });

  } catch (err) {
    console.error(`[AI] Bridge Setup Failed: ${err.message}`);
  }
}

/**
 * 새로운 Producer가 생성되었을 때 호출되어 브리지를 갱신할 수 있게 함
 */
async function notifyNewProducer(broadcastId, producerId) {
  const agent = activeAgents.get(broadcastId);
  if (!agent) return;

  const room = broadcastService.rooms.get(broadcastId);
  const producer = room.producers.get(producerId);
  
  if (producer && producer.kind === 'audio' && producer.id !== agent.aiProducer.id) {
    console.log(`[AI] New audio producer detected: ${producerId}. Updating bridge...`);
    // 약간의 지연을 주어 Producer가 완전히 준비되길 기다림
    setTimeout(() => setupBridgeHandlers(broadcastId), 1000);
  }
}

async function stopAIAgent(broadcastId) {
  const agent = activeAgents.get(broadcastId);
  if (!agent) return;
  
  console.log(`[AI] Stopping Agent for broadcast: ${broadcastId}`);
  
  try {
    if (agent.bridge) {
      agent.bridge.cleanup();
      agent.bridge = null;
    }
    
    if (agent.sttWs) {
      agent.sttWs.removeAllListeners();
      if (agent.sttWs.readyState === WebSocket.OPEN) {
        agent.sttWs.close();
      }
      agent.sttWs = null;
    }

    if (agent.pythonProcess) {
      agent.pythonProcess.kill('SIGKILL');
      agent.pythonProcess = null;
    }

    if (agent.aiProducer && !agent.aiProducer.closed) {
      agent.aiProducer.close();
    }

    if (agent.aiTransport && !agent.aiTransport.closed) {
      agent.aiTransport.close();
    }

    activeAgents.delete(broadcastId);
    console.log(`[AI] Agent stopped successfully for ${broadcastId}`);
  } catch (err) {
    console.error(`[AI] Error during stopAIAgent: ${err.message}`);
  }
  
  return { success: true };
}

module.exports = { startAIAgent, stopAIAgent, notifyNewProducer };
