# 🎙️ 실시간 음성 방송 플랫폼 API 명세서

이 프로젝트는 Mediasoup을 이용한 실시간 음성 스트리밍과 유저별 개인 게시판 기능을 제공합니다.

## 1. 인증 (Authentication)
모든 보호된 경로는 헤더에 `x-auth-token`을 필요로 합니다.

### 회원가입
- **URL:** `/api/auth/signup`
- **Method:** `POST`
- **Body:** `{ username, password }`

### 로그인
- **URL:** `/api/auth/login`
- **Method:** `POST`
- **Body:** `{ username, password }`
- **Success Response:** `{ token, user: { id, username } }`

### 내 정보 확인
- **URL:** `/api/auth/me`
- **Method:** `GET`
- **Header:** `x-auth-token: <token>`

---

## 2. 유저 및 게시판 (User & Board)

### 유저 목록 조회
- **URL:** `/api/user/list`
- **Method:** `GET`
- **Description:** 시스템의 모든 유저 목록을 가져옵니다.

### 유저 게시판 조회 (또는 생성)
- **URL:** `/api/user/:userId/board`
- **Method:** `GET`
- **Description:** 특정 유저의 게시판 정보를 가져옵니다. 게시판이 없으면 자동 생성됩니다.
- **Response:** `{ _id, ownerId, title, description, createdAt }`

### 게시판 게시글 목록 조회
- **URL:** `/api/user/board/:boardId/posts`
- **Method:** `GET`
- **Description:** 특정 게시판에 작성된 모든 게시글을 최신순으로 가져옵니다.

### 게시글 작성
- **URL:** `/api/user/board/:boardId/post`
- **Method:** `POST`
- **Header:** `x-auth-token: <token>`
- **Body:** `{ title, content, category }`
- **Category:** `일반`, `Q&A`, `공지`

---

## 3. 방송 (Broadcast)

### 라이브 방송 목록 조회
- **URL:** `/api/broadcast/live`
- **Method:** `GET`

### 방송 종료 (Host 전용)
- **URL:** `/api/broadcast/end/:broadcastId`
- **Method:** `POST`
- **Header:** `x-auth-token: <token>`

---

## 4. 실시간 통신 (Socket.IO Events)

### 방송 관리
- `createBroadcast`: `{ title }` -> 응답 `{ success, broadcastId, rtpCapabilities }`
- `joinBroadcast`: `{ broadcastId }` -> 응답 `{ success, rtpCapabilities }`

### WebRTC 시그널링 (Mediasoup)
- `createWebRtcTransport`: `{ broadcastId }` -> 응답 `{ success, params: { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers } }`
- `connectWebRtcTransport`: `{ broadcastId, transportId, dtlsParameters }`
- `produce`: `{ broadcastId, transportId, kind, rtpParameters }`
- `consume`: `{ broadcastId, transportId, producerId, rtpCapabilities }`
- `resumeConsumer`: `{ broadcastId, consumerId }`

### 채팅
- `sendChat`: `{ message }` -> 브로드캐스트 `receiveChat`: `{ username, message, createdAt }`

---

## 5. 네트워크 설정 (NAT Traversal)
- 프로젝트는 `STUN/TURN` 설정을 지원합니다.
- 기본적으로 Google STUN 서버(`stun:stun.l.google.com:19302`)가 설정되어 있습니다.
- `src/config/index.js`에서 추가적인 TURN 서버(coturn 등)를 설정할 수 있습니다.
