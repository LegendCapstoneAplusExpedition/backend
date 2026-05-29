const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const auth = require('../middlewares/auth');

// 특정 게시글의 댓글 조회 및 작성 (postId 기준)
router.get('/post/:postId', commentController.getComments);
router.post('/post/:postId', auth, commentController.createComment);

// 개별 댓글 수정 및 삭제 (commentId 기준)
router.put('/:id', auth, commentController.updateComment);
router.delete('/:id', auth, commentController.deleteComment);

module.exports = router;
