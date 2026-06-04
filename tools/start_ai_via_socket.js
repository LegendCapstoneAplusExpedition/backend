const io = require('socket.io-client');
const axios = require('axios');

async function run() {
	try {
		// Create a temporary test user via API and obtain a real JWT
		const username = `tool_tester_${Date.now()}`;
		const password = 'TestPass123!';

		try {
			await axios.post('http://localhost:3000/api/auth/signup', { username, password }, { timeout: 5000 });
			console.log('Signed up test user:', username);
		} catch (e) {
			// ignore if already exists
			console.log('Signup response (ignored if exists):', e && e.response && e.response.data ? e.response.data : e.message);
		}

		const loginRes = await axios.post('http://localhost:3000/api/auth/login', { username, password }, { timeout: 5000 });
		const token = loginRes.data.token;

		console.log('Attempting socket connection to http://localhost:3000 as', username);
		const socket = io('http://localhost:3000', {
			path: '/socket.io/',
			auth: { token },
			transports: ['websocket', 'polling'],
			extraHeaders: { 'x-auth-token': token },
			forceNew: true,
			timeout: 5000,
		});

		socket.on('connect', async () => {
			console.log('Socket connected:', socket.id);
			socket.emit('createBroadcast', { title: 'tool-test' }, async (res) => {
				console.log('createBroadcast response:', res);
				if (res && res.broadcastId) {
					try {
						const startRes = await axios.post(`http://localhost:3000/api/broadcast/${res.broadcastId}/ai/start`, {}, {
							headers: { 'x-auth-token': token },
							timeout: 10000,
						});
						console.log('AI start response:', startRes.data);
					} catch (err) {
						console.error('AI start error:', err && err.response ? err.response.data : err.message);
					}
				}
				socket.close();
				process.exit(0);
			});
		});

		socket.on('connect_error', (err) => {
			console.error('connect_error:', err && err.message ? err.message : err);
			process.exit(2);
		});

		socket.on('error', (e) => console.error('socket error:', e));
		socket.on('disconnect', (reason) => console.log('socket disconnect:', reason));
	} catch (e) {
		console.error('Unexpected error:', e);
		process.exit(3);
	}
}

run();
