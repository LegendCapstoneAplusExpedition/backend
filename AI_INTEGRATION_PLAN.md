# LCAE AI 에이전트 통합 계획

현재 AI 팀의 파이프라인(`STT -> LLM -> TTS`)을 방송 시스템에 통합하기 위한 기술 설계입니다.

## 1. 아키텍처 개요

1.  **AI Process**: Python으로 실행되는 `main.py`가 WebSocket 서버 모드로 대기합니다.
2.  **Node.js Bridge**: Mediasoup의 오디오 데이터를 AI Agent와 주고받는 중계 역할을 합니다.
    -   **Host -> AI (STT)**: 호스트의 오디오를 Mediasoup `DirectTransport`(또는 `PlainTransport`)로 받아 16kHz Mono PCM으로 변환 후 AI WebSocket으로 전송합니다.
    -   **AI -> Listeners (TTS)**: AI가 생성한 22kHz Mono PCM을 받아 Mediasoup `Producer`를 통해 방송방에 송출합니다.

## 2. 세부 구현 단계

### 단계 1: AI 에이전트 실행 (Python)
Node.js 서버에서 `child_process`를 사용하여 `ai-module/main.py`를 실행합니다.
```bash
python main.py --mode server --port 8765
```

### 단계 2: 오디오 중계 서비스 (`src/services/aiService.js`)
Mediasoup의 `DirectTransport`를 사용하여 V8이나 Opus 데이터를 PCM으로 변환합니다. `fluent-ffmpeg`를 활용하여 샘플레이트를 조정합니다.

### 단계 3: 방송 제어 API (`src/routes/ai.js`)
방송 호스트가 AI 진행자를 켜고 끌 수 있는 엔드포인트를 제공합니다.
- `POST /api/broadcast/:id/ai/start`
- `POST /api/broadcast/:id/ai/stop`

## 3. 핵심 코드 로직 (Concept)

```javascript
// AI 에이전트의 목소리를 방송에 추가하는 로직
async function startAIDJ(broadcastId) {
  const room = rooms.get(broadcastId);
  
  // 1. AI 목소리를 위한 DirectTransport 생성
  const aiTransport = await room.router.createDirectTransport();
  
  // 2. AI 음성을 방송에 송출할 Producer 생성
  const aiProducer = await aiTransport.produce({ kind: 'audio', ... });
  
  // 3. AI WebSocket 연결 (TTS 수신용)
  const ttsWs = new WebSocket('ws://localhost:8765/tts');
  ttsWs.on('message', (data) => {
    // 받은 PCM 데이터를 aiTransport.send(data)로 송출
  });
}
```

## 4. 필요한 추가 작업
- Python 환경 구성 (`pip install -r src/ai-module/requirements.txt`)
- FFmpeg 설치 확인 (오디오 포맷 변환용)
- Mediasoup `DirectTransport` 활용을 위한 라이브러리 설정
