const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const auth = require('../middlewares/auth');
const Comment = require('../models/Comment');
const Post = require('../models/Post');

// 댓글 목록 조회
router.get('/:id/comments', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select('_id');
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const comments = await Comment.find({ postId: req.params.id })
      .populate('authorId', 'username')
      .sort({ createdAt: 1 });

    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 댓글 작성
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';

    if (!content) {
      return res.status(400).json({ error: '댓글 내용을 입력하세요.' });
    }

    const post = await Post.findById(req.params.id).select('_id');
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const comment = new Comment({
      authorId: req.user.userId,
      content,
      postId: req.params.id,
    });
    await comment.save();

    const savedComment = await Comment.findById(comment._id).populate('authorId', 'username');
    res.status(201).json(savedComment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 좋아요 토글
router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const userId = req.user.userId.toString();
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const liked = likes.some(likeUserId => likeUserId.toString() === userId);

    if (liked) {
      post.likes = likes.filter(likeUserId => likeUserId.toString() !== userId);
    } else {
      post.likes = [...likes, req.user.userId];
    }

    await post.save();

    res.json({
      liked: !liked,
      likesCount: post.likes.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 게시글 수정
router.put('/:id', auth, postController.updatePost);

// 게시글 삭제
router.delete('/:id', auth, postController.deletePost);

module.exports = router;
