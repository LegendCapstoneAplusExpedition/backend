const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const aiService = require('../services/aiService');

/**
 * @swagger
 * tags:
 *   name: AI
 *   description: AI 에이전트(진행자) 관리 및 방송 연동
 */

/**
 * @swagger
 * /api/broadcast/{id}/ai/start:
 *   post:
 *     summary: AI 에이전트(진행자) 소환
 *     description: |
 *       특정 방송방에 AI 에이전트를 참여시킵니다. 
 *       백엔드에서 Python 프로세스를 실행하고 Mediasoup 오디오 브릿지를 연결합니다.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 방송 ID (Broadcast ID)
 *     responses:
 *       200:
 *         description: AI 에이전트 시작 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: 이미 AI가 실행 중이거나 방송을 찾을 수 없음
 *       401:
 *         description: 인증 실패
 */
router.post('/:id/ai/start', auth, async (req, res) => {
  try {
    const result = await aiService.startAIAgent(req.params.id);
    
    // 클라이언트들에게 AI Producer가 생성되었음을 알림
    if (global.io && result.aiProducerId) {
      global.io.to(req.params.id).emit('newProducer', { 
        producerId: result.aiProducerId,
        isAI: true 
      });
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/broadcast/{id}/ai/stop:
 *   post:
 *     summary: AI 에이전트 퇴장
 *     description: 실행 중인 AI 에이전트 프로세스를 종료하고 오디오 브릿지를 해제합니다.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 방송 ID
 *     responses:
 *       200:
 *         description: AI 에이전트 종료 성공
 *       401:
 *         description: 인증 실패
 */
router.post('/:id/ai/stop', auth, async (req, res) => {
  try {
    const result = await aiService.stopAIAgent(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
