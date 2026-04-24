const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const broadcastController = require('../controllers/broadcastController');

/**
 * @swagger
 * tags:
 *   name: Broadcast
 *   description: 실시간 방송 관리
 */

/**
 * @swagger
 * /api/broadcast/live:
 *   get:
 *     summary: 현재 진행 중인 모든 라이브 방송 목록 조회
 *     tags: [Broadcast]
 *     responses:
 *       200:
 *         description: 방송 목록 반환
 */
router.get('/live', broadcastController.getLiveBroadcasts);

/**
 * @swagger
 * /api/broadcast/end/{id}:
 *   post:
 *     summary: 방송 종료 (호스트 전용)
 *     tags: [Broadcast]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 종료할 방송의 ID
 *     responses:
 *       200:
 *         description: 방송 종료 성공
 *       400:
 *         description: 요청 오류 또는 권한 없음
 */
router.post('/end/:id', auth, broadcastController.endBroadcast);

module.exports = router;
