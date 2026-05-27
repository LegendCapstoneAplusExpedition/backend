const Post = require('../models/Post');

exports.updatePost = async (postId, userId, updateData) => {
  const post = await Post.findById(postId);
  if (!post) {
    throw new Error('POST_NOT_FOUND');
  }

  if (post.authorId.toString() !== userId) {
    throw new Error('NOT_AUTHORIZED');
  }

  // Handle case where only 'content' is provided in title\ncontent format
  if (updateData.content && !updateData.title) {
    const lines = updateData.content.split('\n');
    if (lines.length > 1) {
      post.title = lines[0].trim();
      post.content = lines.slice(1).join('\n').trim();
    } else {
      post.title = lines[0].trim();
      post.content = lines[0].trim();
    }
  } else {
    if (updateData.title) post.title = updateData.title;
    if (updateData.content) post.content = updateData.content;
  }

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
