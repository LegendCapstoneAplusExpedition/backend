const postService = require('../services/postService');

exports.updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updateData = req.body;

    const updatedPost = await postService.updatePost(id, userId, updateData);
    res.status(200).json(updatedPost);
  } catch (err) {
    if (err.message === 'POST_NOT_FOUND') {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }
    if (err.message === 'NOT_AUTHORIZED') {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const result = await postService.deletePost(id, userId);
    res.status(200).json(result);
  } catch (err) {
    if (err.message === 'POST_NOT_FOUND') {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }
    if (err.message === 'NOT_AUTHORIZED') {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
