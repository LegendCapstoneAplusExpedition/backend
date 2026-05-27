const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const auth = require('../middlewares/auth');

// 게시글 수정
router.put('/:id', auth, postController.updatePost);

// 게시글 삭제
router.delete('/:id', auth, postController.deletePost);

module.exports = router;
