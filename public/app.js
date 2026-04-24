let socket;
let device;
let sendTransport;
let recvTransport;
let producer;
let consumer;
let currentBroadcastId;
let currentBoardId = null;
let userData = null;

// --- 1. Authentication ---

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok) {
        localStorage.setItem('token', data.token);
        userData = data.user;
        showMain();
        connectSocket(data.token);
    } else {
        alert(data.error);
    }
}

async function signup() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    alert(data.message || data.error);
}

function connectSocket(token) {
    if (socket) socket.disconnect();
    
    socket = io({
        auth: { token }
    });

    socket.on('connect', () => console.log('Connected to socket server'));
    socket.on('receiveChat', addChatMessage);
    socket.on('newProducer', onNewProducer);
    socket.on('broadcastEnded', () => {
        alert('방송이 종료되었습니다.');
        leaveRoom();
    });
    socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        if (err.message.includes('Authentication error')) {
            logout();
        }
    });
}

// --- 2. Broadcast Room Logic ---

function showMain() {
    if (!userData) return;
    document.getElementById('display-name').innerText = userData.username;
    showSection('main-section');
    fetchLiveBroadcasts();
    fetchUserList();
}

async function fetchLiveBroadcasts() {
    try {
        const res = await fetch('/api/broadcast/live');
        const broadcasts = await res.json();

        const container = document.getElementById('live-broadcasts-container');
        container.innerHTML = '';

        if (broadcasts.length === 0) {
            container.innerHTML = '<p>현재 진행 중인 방송이 없습니다.</p>';
            return;
        }

        broadcasts.forEach(b => {
            const div = document.createElement('div');
            div.style = 'padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;';
            div.innerHTML = `
                <div>
                    <strong>${b.title}</strong> <br>
                    <small>Host: ${b.host?.username || '알 수 없음'} | 시청자: ${b.viewersCount}</small>
                </div>
                <button onclick="joinBroadcast('${b._id}')" style="width: auto; padding: 5px 15px;">입장</button>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error('Failed to fetch broadcasts:', err);
    }
}

async function showCreateBroadcast() {
    const title = prompt('방송 제목을 입력하세요:');
    if (!title) return;

    socket.emit('createBroadcast', { title }, async (res) => {
        if (res.success) {
            currentBroadcastId = res.broadcastId;
            document.getElementById('room-id').innerText = currentBroadcastId;
            document.getElementById('room-title').innerText = title;
            
            showSection('room-section');
            document.getElementById('host-controls').classList.remove('hidden');

            try {
                await initMediasoup(res.rtpCapabilities);
            } catch (err) {
                alert('음성 엔진 초기화 실패: ' + err.message);
            }
        } else {
            alert('방송 생성 실패: ' + res.error);
        }
    });
}

async function joinBroadcastManual() {
    const id = document.getElementById('join-broadcast-id').value;
    if (id) joinBroadcast(id);
}

async function joinBroadcast(broadcastId) {
    socket.emit('joinBroadcast', { broadcastId }, async (res) => {
        if (res.success) {
            currentBroadcastId = broadcastId;
            document.getElementById('room-id').innerText = currentBroadcastId;
            document.getElementById('room-title').innerText = '방송 청취 중';

            showSection('room-section');
            document.getElementById('listener-controls').classList.remove('hidden');

            try {
                await initMediasoup(res.rtpCapabilities);
            } catch (err) {
                alert('음성 엔진 초기화 실패: ' + err.message);
            }
        } else {
            alert('입장 실패: ' + res.error);
        }
    });
}

async function endBroadcast() {
    if (!confirm('정말로 방송을 종료하시겠습니까?')) return;

    const res = await fetch(`/api/broadcast/end/${currentBroadcastId}`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-auth-token': localStorage.getItem('token')
        }
    });

    const data = await res.json();
    if (res.ok) {
        alert('방송이 종료되었습니다.');
        leaveRoom();
    } else {
        alert('방송 종료 실패: ' + data.error);
    }
}

// --- AI Agent Control ---

async function toggleAIAgent(start) {
    const action = start ? 'start' : 'stop';
    const statusText = document.getElementById('ai-status');
    const startBtn = document.getElementById('start-ai-btn');
    const stopBtn = document.getElementById('stop-ai-btn');

    try {
        statusText.innerText = start ? 'AI 진행자를 불러오는 중...' : 'AI 진행자가 퇴장하는 중...';
        
        const res = await fetch(`/api/broadcast/${currentBroadcastId}/ai/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': localStorage.getItem('token')
            }
        });

        const data = await res.json();
        if (res.ok) {
            if (start) {
                statusText.innerText = '✅ AI 진행자가 대화에 참여 중입니다.';
                startBtn.style.display = 'none';
                stopBtn.style.display = 'block';
            } else {
                statusText.innerText = 'AI 진행자가 퇴장했습니다.';
                startBtn.style.display = 'block';
                stopBtn.style.display = 'none';
            }
        } else {
            alert('AI 제어 실패: ' + data.error);
            statusText.innerText = '오류 발생';
        }
    } catch (err) {
        console.error('AI toggle error:', err);
        statusText.innerText = '네트워크 오류';
    }
}

// --- 3. Mediasoup (Streaming) ---

async function initMediasoup(rtpCapabilities) {
    try {
        // Wait for mediasoupClient to be available on window (if loaded via type="module")
        let mClient = window.mediasoupClient;
        let attempts = 0;
        while (!mClient && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            mClient = window.mediasoupClient;
            attempts++;
        }

        if (!mClient) {
            throw new Error('mediasoup-client 라이브러리를 로드할 수 없습니다.');
        }
        
        device = new mClient.Device();
        await device.load({ routerRtpCapabilities: rtpCapabilities });
        console.log('Mediasoup Device loaded');
    } catch (err) {
        console.error('Failed to init mediasoup:', err);
        throw err;
    }
}

async function startStreaming() {
    if (!device || !device.loaded) {
        alert('음성 장치가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
        return;
    }

    socket.emit('createWebRtcTransport', { broadcastId: currentBroadcastId }, async (res) => {
        if (!res.success) return alert(res.error);

        try {
            sendTransport = device.createSendTransport(res.params);

            sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                socket.emit('connectWebRtcTransport', { 
                    broadcastId: currentBroadcastId, 
                    transportId: sendTransport.id, 
                    dtlsParameters 
                }, (res) => res.success ? callback() : errback());
            });

            sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
                socket.emit('produce', { 
                    broadcastId: currentBroadcastId, 
                    transportId: sendTransport.id, 
                    kind, 
                    rtpParameters 
                }, (res) => res.success ? callback({ id: res.producerId }) : errback());
            });

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const track = stream.getAudioTracks()[0];
            producer = await sendTransport.produce({ track });

            document.getElementById('streaming-status').innerText = '🎙️ 방송 송출 중...';
            document.getElementById('start-produce').disabled = true;
        } catch (err) {
            console.error('Failed to create send transport or produce:', err);
            alert('Streaming failed: ' + err.message);
        }
    });
}

async function onNewProducer({ producerId }) {
    if (!device || !device.loaded) return;

    socket.emit('createWebRtcTransport', { broadcastId: currentBroadcastId }, async (res) => {
        if (!res.success) return;

        try {
            recvTransport = device.createRecvTransport(res.params);

            recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                socket.emit('connectWebRtcTransport', { 
                    broadcastId: currentBroadcastId, 
                    transportId: recvTransport.id, 
                    dtlsParameters 
                }, (res) => res.success ? callback() : errback());
            });

            socket.emit('consume', {
                broadcastId: currentBroadcastId,
                transportId: recvTransport.id,
                producerId,
                rtpCapabilities: device.rtpCapabilities
            }, async (res) => {
                if (!res.success) return;

                consumer = await recvTransport.consume({
                    id: res.id,
                    producerId: res.producerId,
                    kind: res.kind,
                    rtpParameters: res.rtpParameters
                });

                const { track } = consumer;
                document.getElementById('remote-audio').srcObject = new MediaStream([track]);
                
                socket.emit('resumeConsumer', { 
                    broadcastId: currentBroadcastId, 
                    consumerId: consumer.id 
                }, () => {});
            });
        } catch (err) {
            console.error('Failed to consume:', err);
        }
    });
}

// --- 4. Chat & UI Helpers ---

function sendChat() {
    const input = document.getElementById('chat-input');
    const message = input.value;
    if (!message) return;

    socket.emit('sendChat', { message });
    input.value = '';
}

function addChatMessage({ username, message }) {
    const chatMessages = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message';
    msgDiv.innerHTML = `<span class="user">${username}:</span> ${message}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function logout() {
    localStorage.removeItem('token');
    location.reload();
}

function leaveRoom() {
    location.reload();
}

function showSection(id) {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('main-section').classList.add('hidden');
    document.getElementById('room-section').classList.add('hidden');
    document.getElementById('board-section').classList.add('hidden');
    document.getElementById(id).classList.remove('hidden');
}

// --- 5. User Board (Posts) ---

async function fetchUserList() {
    try {
        const res = await fetch('/api/user/list');
        const users = await res.json();

        const container = document.getElementById('user-list-container');
        container.innerHTML = '';

        users.forEach(u => {
            const div = document.createElement('div');
            div.style = 'padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;';
            div.innerHTML = `
                <div><strong>${u.username}</strong></div>
                <button onclick="showBoard('${u._id}')" style="width: auto; padding: 5px 15px;">게시판 가기</button>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error('Failed to fetch user list:', err);
    }
}

async function showBoard(userId) {
    try {
        const res = await fetch(`/api/user/${userId}/board`);
        const board = await res.json();
        
        if (res.ok) {
            currentBoardId = board._id;
            document.getElementById('board-title-display').innerText = board.title;
            document.getElementById('board-description-display').innerText = board.description || '';
            showSection('board-section');
            fetchPosts(board._id);
        } else {
            alert(board.error || '게시판을 불러올 수 없습니다.');
        }
    } catch (err) {
        console.error('Failed to show board:', err);
    }
}

async function fetchPosts(boardId) {
    try {
        const res = await fetch(`/api/user/board/${boardId}/posts`);
        const posts = await res.json();

        const container = document.getElementById('posts-container');
        container.innerHTML = '';

        if (posts.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999; margin-top: 20px;">등록된 글이 없습니다.</p>';
            return;
        }

        posts.forEach(p => {
            const div = document.createElement('div');
            div.style = 'padding: 15px; border-bottom: 1px solid #eee; background: white; margin-bottom: 10px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="background: #eee; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; color: #666;">${p.category}</span>
                    <small style="color: #999;">${new Date(p.createdAt).toLocaleString()}</small>
                </div>
                <div style="font-weight: bold; font-size: 1.1em; margin-bottom: 5px;">${p.title}</div>
                <div style="font-size: 0.95em; color: #333; white-space: pre-wrap; margin-bottom: 10px;">${p.content}</div>
                <div style="font-size: 0.85em; color: #007bff; text-align: right;">
                    작성자: ${p.authorId?.username || '알 수 없음'}
                </div>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error('Failed to fetch posts:', err);
    }
}

async function postNewPost() {
    const titleInput = document.getElementById('post-title-input');
    const contentInput = document.getElementById('post-content-input');
    const categorySelect = document.getElementById('post-category-select');
    
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const category = categorySelect.value;

    if (!title || !content) {
        alert('제목과 내용을 입력해주세요.');
        return;
    }

    try {
        const res = await fetch(`/api/user/board/${currentBoardId}/post`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': localStorage.getItem('token')
            },
            body: JSON.stringify({ title, content, category })
        });

        if (res.ok) {
            titleInput.value = '';
            contentInput.value = '';
            fetchPosts(currentBoardId);
        } else {
            const data = await res.json();
            alert(data.error || '글 작성 실패');
        }
    } catch (err) {
        console.error('Failed to post new post:', err);
    }
}

window.onload = async () => {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'x-auth-token': token }
            });
            if (res.ok) {
                const data = await res.json();
                userData = { id: data._id, username: data.username };
                showMain();
                connectSocket(token);
            } else {
                localStorage.removeItem('token');
            }
        } catch (err) {
            console.error('Auto-login failed:', err);
        }
    }
};
