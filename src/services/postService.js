const Post = require('../models/Post');

exports.updatePost = async (postId, userId, updateData) => {
  const post = await Post.findById(postId);
  if (!post) {
    throw new Error('POST_NOT_FOUND');
  }

  if (post.authorId.toString() !== userId) {
    throw new Error('NOT_AUTHORIZED');
  }

  // Update only content and category
  if (updateData.content) post.content = updateData.content;
  if (updateData.category) post.category = updateData.category;

  return await post.save();
};

exports.deletePost = async (postId, userId) => {
  const post = await Post.findById(postId);
  if (!post) {
    throw new Error('POST_NOT_FOUND');
  }

  if (post.authorId.toString() !== userId) {
    throw new Error('NOT_AUTHORIZED');
  }

  await Post.findByIdAndDelete(postId);
  return { message: 'Post deleted successfully' };
};
