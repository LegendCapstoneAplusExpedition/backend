const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const WebSocket = require('ws');
const broadcastService = require('./broadcastService');

const activeAgents = new Map();

async function startAIAgent(broadcastId) {
  if (activeAgents.has(broadcastId)) {
    throw new Error('AI Agent is already running for this broadcast');
  }

  const room = broadcastService.rooms.get(broadcastId);
  if (!room) throw new Error('Broadcast room not found');

  console.log(`[AI] Starting Agent for broadcast: ${broadcastId}`);

  // 1. Python 프로세스 실행
  const pythonPath = path.join(__dirname, '../ai-module/.venv/bin/python'); 
  const scriptPath = path.join(__dirname, '../ai-module/main.py');
  const aiPort = 8765;
  
  const pythonProcess = spawn(pythonPath, [
    scriptPath,
    '--mode', 'server',
    '--port', aiPort.toString()
  ]);

  pythonProcess.stdout.on('data', (data) => console.log(`[AI-Py-Out]: ${data}`));
  pythonProcess.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('Using cache found in')) {
      console.log(`[AI-Py-Log]: ${msg.trim()}`);
    } else {
      console.error(`[AI-Py-Err]: ${msg.trim()}`);
    }
  });

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
    pythonProcess,
    aiProducer,
    aiTransport,
    status: 'starting',
    bridge: null,
    sttWs: null
  };
  activeAgents.set(broadcastId, agent);

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
      console.error(`[AI] STT WebSocket error: ${err.message}`);
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
      '-f', 'rtp',
      `rtp://127.0.0.1:${ttsRtpPort}?payload_type=101`
    ]);

    ffmpegTTS.on('error', (err) => console.error(`[AI] FFmpeg TTS Error: ${err.message}`));

    const ttsUdpSocket = dgram.createSocket('udp4');
    ttsUdpSocket.on('error', (err) => console.error(`[AI] TTS UDP Socket Error: ${err.message}`));
    
    ttsUdpSocket.bind(ttsRtpPort, '127.0.0.1');
    ttsUdpSocket.on('message', (packet) => {
      try {
        if (agent.aiTransport && !agent.aiTransport.closed) {
          agent.aiTransport.sendRtp(packet);
        }
      } catch (err) {}
    });

    const onMessage = (data) => {
      if (Buffer.isBuffer(data) && ffmpegTTS.stdin.writable) {
        ffmpegTTS.stdin.write(data);
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
