const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Board = require("../models/Board");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const auth = require("../middlewares/auth");
const jwt = require("jsonwebtoken");
const config = require("../config");
const subscriptionController = require("../controllers/subscriptionController");

function getOptionalUserId(req) {
  const authHeader = req.headers["authorization"];
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
  const token = bearerToken || req.headers["x-auth-token"];

  if (!token) return null;

  try {
    return jwt.verify(token, config.jwtSecret).userId;
  } catch {
    return null;
  }
}

/**
 * @swagger
 * tags:
 *   name: User
 *   description: 유저 및 게시판 관리
 */

/**
 * @swagger
 * /api/user/subscriptions:
 *   get:
 *     summary: 내 구독 목록 조회
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 구독 목록 반환
 */
router.get("/subscriptions", auth, subscriptionController.getMySubscriptions);

/**
 * @swagger
 * /api/user/subscribe/{mentorId}:
 *   post:
 *     summary: 멘토 구독
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mentorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: 구독 성공
 */
router.post("/subscribe/:mentorId", auth, subscriptionController.subscribe);

/**
 * @swagger
 * /api/user/subscribe/{mentorId}:
 *   delete:
 *     summary: 구독 취소
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mentorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 구독 취소 성공
 */
router.delete("/subscribe/:mentorId", auth, subscriptionController.unsubscribe);

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
router.get("/list", async (req, res) => {
  try {
    const users = await User.find().select("username createdAt");
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
router.get("/:userId/board", async (req, res) => {
  try {
    let board = await Board.findOne({ ownerId: req.params.userId });

    if (!board) {
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      board = new Board({
        ownerId: user._id,
        title: `${user.username}님의 게시판`,
        description: `${user.username}님의 공간입니다.`,
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
router.get("/board/:boardId/posts", async (req, res) => {
  try {
    const userId = getOptionalUserId(req);
    const posts = await Post.find({ boardId: req.params.boardId })
      .populate("authorId", "username")
      .sort({ createdAt: -1 });
    const commentCounts = await Comment.aggregate([
      { $match: { postId: { $in: posts.map((post) => post._id) } } },
      { $group: { _id: "$postId", count: { $sum: 1 } } },
    ]);
    const countByPostId = new Map(
      commentCounts.map((item) => [item._id.toString(), item.count]),
    );

    res.json(
      posts.map((post) => {
        const data = post.toObject();
        const likes = Array.isArray(data.likes) ? data.likes : [];

        return {
          ...data,
          commentsCount: countByPostId.get(post._id.toString()) || 0,
          likedByMe: userId
            ? likes.some(
                (likeUserId) => likeUserId.toString() === userId.toString(),
              )
            : false,
          likesCount: likes.length,
        };
      }),
    );
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
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               category:
 *                 type: string
 *                 default: 일반
 *     responses:
 *       201:
 *         description: 게시글 작성 성공
 */
router.post("/board/:boardId/post", auth, async (req, res) => {
  try {
    const { content, category } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    const post = new Post({
      boardId: req.params.boardId,
      authorId: req.user.userId,
      content,
      category: category || "일반",
    });

    await post.save();

    const savedPost = await Post.findById(post._id).populate(
      "authorId",
      "username",
    );
    res.status(201).json(savedPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
