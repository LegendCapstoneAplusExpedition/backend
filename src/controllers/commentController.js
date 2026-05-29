const commentService = require('../services/commentService');

exports.createComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const authorId = req.user.userId;
    const { content } = req.body;

    const comment = await commentService.createComment(postId, authorId, content);
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: '댓글 작성 중 오류가 발생했습니다.' });
  }
};

exports.getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const comments = await commentService.getCommentsByPostId(postId);
    res.status(200).json(comments);
  } catch (err) {
    res.status(500).json({ error: '댓글 조회 중 오류가 발생했습니다.' });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { content } = req.body;

    const updatedComment = await commentService.updateComment(id, userId, content);
    res.status(200).json(updatedComment);
  } catch (err) {
    if (err.message === 'COMMENT_NOT_FOUND') {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }
    if (err.message === 'NOT_AUTHORIZED') {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    res.status(500).json({ error: '댓글 수정 중 오류가 발생했습니다.' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const result = await commentService.deleteComment(id, userId);
    res.status(200).json(result);
  } catch (err) {
    if (err.message === 'COMMENT_NOT_FOUND') {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }
    if (err.message === 'NOT_AUTHORIZED') {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    res.status(500).json({ error: '댓글 삭제 중 오류가 발생했습니다.' });
  }
};
