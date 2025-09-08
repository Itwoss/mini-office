import express from 'express';
import { body, validationResult } from 'express-validator';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { uploadPostImages, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

// Get all posts (home feed)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sort = req.query.sort || 'recent'; // recent, popular, trending

    let sortQuery = { createdAt: -1 };
    let matchQuery = { isDeleted: false, group: null };

    // If user is authenticated, show posts from followed users and own posts
    if (req.user) {
      const followingIds = req.user.following.concat(req.user._id);
      matchQuery.author = { $in: followingIds };
    }

    switch (sort) {
      case 'popular':
        sortQuery = { likeCount: -1, createdAt: -1 };
        break;
      case 'trending':
        // Posts from last 7 days sorted by engagement
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        matchQuery.createdAt = { $gte: weekAgo };
        break;
      default:
        sortQuery = { createdAt: -1 };
    }

    const posts = await Post.find(matchQuery)
      .populate('author', 'name avatar')
      .populate('comments.author', 'name avatar')
      .populate('likes', 'name')
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Add like status for authenticated users
    if (req.user) {
      posts.forEach(post => {
        post.isLikedByUser = post.likes.some(like => 
          like._id.toString() === req.user._id.toString()
        );
        post.isBookmarkedByUser = req.user.bookmarkedPosts.includes(post._id);
      });
    }

    const totalCount = await Post.countDocuments(matchQuery);

    res.json({
      posts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
      hasNextPage: page < Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single post
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id)
      .populate('author', 'name avatar bio followersCount')
      .populate('comments.author', 'name avatar')
      .populate('likes', 'name avatar')
      .lean();

    if (!post || post.isDeleted) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Increment view count
    await Post.findByIdAndUpdate(id, { $inc: { views: 1 } });

    // Add user-specific data if authenticated
    if (req.user) {
      post.isLikedByUser = post.likes.some(like => 
        like._id.toString() === req.user._id.toString()
      );
      post.isBookmarkedByUser = req.user.bookmarkedPosts.includes(post._id);
      post.canEdit = post.author._id.toString() === req.user._id.toString();
    }

    res.json({ post });
  } catch (error) {
    console.error('Get single post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new post
router.post('/', authenticateToken, uploadPostImages.array('images', 5), handleUploadError, [
  body('title').trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
  body('description').trim().isLength({ min: 1, max: 2000 }).withMessage('Description must be 1-2000 characters'),
  body('link').optional().isURL().withMessage('Link must be a valid URL'),
  body('groupId').optional().isMongoId().withMessage('Invalid group ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { title, description, link, groupId } = req.body;

    const postData = {
      title,
      description,
      author: req.user._id,
      images: req.files ? req.files.map(file => ({
        url: file.path,
        publicId: file.filename
      })) : [],
    };

    if (link) postData.link = link;
    if (groupId) postData.group = groupId;

    const post = new Post(postData);
    await post.save();

    // Populate author info
    await post.populate('author', 'name avatar');

    // If it's a group post, update group stats
    if (groupId) {
      const Group = (await import('../models/Group.js')).default;
      await Group.findByIdAndUpdate(groupId, {
        $inc: { 'stats.totalPosts': 1 }
      });
    }

    res.status(201).json({
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update post
router.put('/:id', authenticateToken, [
  body('title').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
  body('description').optional().trim().isLength({ min: 1, max: 2000 }).withMessage('Description must be 1-2000 characters'),
  body('link').optional().isURL().withMessage('Link must be a valid URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { id } = req.params;
    const { title, description, link } = req.body;

    const post = await Post.findById(id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user is the author
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own posts' });
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (link !== undefined) updateData.link = link;

    const updatedPost = await Post.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('author', 'name avatar');

    res.json({
      message: 'Post updated successfully',
      post: updatedPost
    });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete post
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user is the author or admin
    const canDelete = post.author.toString() === req.user._id.toString() || 
                     req.user.role === 'admin';
    
    if (!canDelete) {
      return res.status(403).json({ message: 'You can only delete your own posts' });
    }

    // Soft delete
    post.isDeleted = true;
    await post.save();

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Like/Unlike post
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const userId = req.user._id;
    const isLiked = post.likes.includes(userId);

    let message;
    if (isLiked) {
      await post.removeLike(userId);
      message = 'Post unliked';
    } else {
      await post.addLike(userId);
      message = 'Post liked';

      // Add notification to post author (if not self-like)
      if (post.author.toString() !== userId.toString()) {
        const postAuthor = await User.findById(post.author);
        await postAuthor.addNotification({
          type: 'like',
          from: userId,
          post: post._id,
          message: `${req.user.name} liked your post`
        });
      }
    }

    const updatedPost = await Post.findById(id)
      .populate('author', 'name avatar')
      .populate('likes', 'name');

    res.json({
      message,
      post: updatedPost,
      isLiked: !isLiked
    });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add comment to post
router.post('/:id/comment', authenticateToken, [
  body('content').trim().isLength({ min: 1, max: 500 }).withMessage('Comment must be 1-500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { id } = req.params;
    const { content } = req.body;

    const post = await Post.findById(id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = await post.addComment(req.user._id, content);
    await post.populate('comments.author', 'name avatar');

    // Add notification to post author (if not self-comment)
    if (post.author.toString() !== req.user._id.toString()) {
      const postAuthor = await User.findById(post.author);
      await postAuthor.addNotification({
        type: 'comment',
        from: req.user._id,
        post: post._id,
        message: `${req.user.name} commented on your post`
      });
    }

    res.status(201).json({
      message: 'Comment added successfully',
      comment: post.comments[post.comments.length - 1]
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get trending posts
router.get('/trending/posts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const posts = await Post.getTrending(limit);

    res.json({
      posts,
      totalCount: posts.length
    });
  } catch (error) {
    console.error('Get trending posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search posts
router.get('/search/posts', async (req, res) => {
  try {
    const { q, page = 1, limit = 20, hashtag } = req.query;
    
    let searchQuery = { isDeleted: false };

    if (hashtag) {
      searchQuery.hashtags = hashtag.toLowerCase().replace('#', '');
    } else if (q && q.trim().length >= 2) {
      searchQuery.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { hashtags: { $regex: q, $options: 'i' } }
      ];
    } else {
      return res.status(400).json({ message: 'Search query or hashtag required' });
    }

    const posts = await Post.find(searchQuery)
      .populate('author', 'name avatar')
      .populate('likes', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalCount = await Post.countDocuments(searchQuery);

    res.json({
      posts,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Search posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bookmark/Unbookmark post
router.post('/:id/bookmark', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const user = await User.findById(req.user._id);
    const isBookmarked = user.bookmarkedPosts.includes(id);

    let message;
    if (isBookmarked) {
      user.bookmarkedPosts.pull(id);
      message = 'Post removed from bookmarks';
    } else {
      user.bookmarkedPosts.push(id);
      message = 'Post bookmarked';
    }

    await user.save();

    res.json({
      message,
      isBookmarked: !isBookmarked
    });
  } catch (error) {
    console.error('Bookmark post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user bookmarks
router.get('/bookmarks/me', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const user = await User.findById(req.user._id)
      .populate({
        path: 'bookmarkedPosts',
        match: { isDeleted: false },
        populate: [
          { path: 'author', select: 'name avatar' },
          { path: 'likes', select: 'name' }
        ],
        options: {
          sort: { createdAt: -1 },
          limit: limit,
          skip: (page - 1) * limit
        }
      });

    const totalCount = await Post.countDocuments({
      _id: { $in: user.bookmarkedPosts },
      isDeleted: false
    });

    res.json({
      posts: user.bookmarkedPosts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get popular hashtags
router.get('/hashtags/popular', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const hashtags = await Post.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: '$hashtags' },
      {
        $group: {
          _id: '$hashtags',
          count: { $sum: 1 },
          recentPosts: { $push: { _id: '$_id', createdAt: '$createdAt' } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          hashtag: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    res.json({ hashtags });
  } catch (error) {
    console.error('Get popular hashtags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;