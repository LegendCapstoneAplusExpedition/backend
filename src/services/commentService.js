const Comment = require('../models/Comment');

exports.createComment = async (postId, authorId, content) => {
  const comment = new Comment({
    postId,
    authorId,
    content
  });
  return await comment.save();
};

exports.getCommentsByPostId = async (postId) => {
  return await Comment.find({ postId }).populate('authorId', 'username');
};

exports.updateComment = async (commentId, userId, content) => {
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new Error('COMMENT_NOT_FOUND');
  }

  if (comment.authorId.toString() !== userId) {
    throw new Error('NOT_AUTHORIZED');
  }

  comment.content = content;
  comment.updatedAt = Date.now();
  return await comment.save();
};

exports.deleteComment = async (commentId, userId) => {
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new Error('COMMENT_NOT_FOUND');
  }

  if (comment.authorId.toString() !== userId) {
    throw new Error('NOT_AUTHORIZED');
  }

  await Comment.findByIdAndDelete(commentId);
  return { success: true };
};
