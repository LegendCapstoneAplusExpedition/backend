const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Board = require('../models/Board');
const Post = require('../models/Post');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: User
 *   description: 유저 및 게시판 관리
 */

/**
 * @swagger
 * /api/user/list:
 *   get:
 *     summary: 전체 사용자 목록 조회
 *     tags: [User]
 *     responses:
 *       200:
 *         description: 유저 목록 반환
 */
router.get('/list', async (req, res) => {
  try {
    const users = await User.find().select('username createdAt');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/user/{userId}/board:
 *   get:
 *     summary: 특정 사용자의 게시판 조회 (없으면 자동 생성)
 *     tags: [User]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 게시판 정보 반환
 */
router.get('/:userId/board', async (req, res) => {
  try {
    let board = await Board.findOne({ ownerId: req.params.userId });
    
    if (!board) {
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      
      board = new Board({
        ownerId: user._id,
        title: `${user.username}님의 게시판`,
        description: `${user.username}님의 공간입니다.`
      });
      await board.save();
    }
    
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/user/board/{boardId}/posts:
 *   get:
 *     summary: 특정 게시판의 게시글 목록 조회
 *     tags: [User]
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 게시글 목록 반환
 */
router.get('/board/:boardId/posts', async (req, res) => {
  try {
    const posts = await Post.find({ boardId: req.params.boardId })
      .populate('authorId', 'username')
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/user/board/{boardId}/post:
 *   post:
 *     summary: 게시글 작성
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               category:
 *                 type: string
 *                 default: 일반
 *     responses:
 *       201:
 *         description: 게시글 작성 성공
 */
router.post('/board/:boardId/post', auth, async (req, res) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
    }

    const post = new Post({
      boardId: req.params.boardId,
      authorId: req.user.userId,
      title,
      content,
      category: category || '일반'
    });

    await post.save();
    
    const savedPost = await Post.findById(post._id).populate('authorId', 'username');
    res.status(201).json(savedPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
