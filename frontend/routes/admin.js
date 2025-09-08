import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Group from '../models/Group.js';
import Message from '../models/Message.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All admin routes require admin authentication
router.use(authenticateToken, requireAdmin);

// Get admin dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalPosts,
      totalGroups,
      totalMessages,
      activeUsers,
      recentUsers,
      recentPosts
    ] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments({ isDeleted: false }),
      Group.countDocuments({ isDeleted: false }),
      Message.countDocuments({ isDeleted: false }),
      User.countDocuments({ isOnline: true }),
      User.countDocuments({ 
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      Post.countDocuments({ 
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        isDeleted: false
      })
    ]);

    // Get user registration trend (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userTrend = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get post creation trend (last 30 days)
    const postTrend = await Post.aggregate([
      { 
        $match: { 
          createdAt: { $gte: thirtyDaysAgo },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      totalUsers,
      totalPosts,
      totalGroups,
      totalMessages,
      activeUsers,
      recentUsers,
      recentPosts,
      trends: {
        users: userTrend,
        posts: postTrend
      }
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const role = req.query.role;
    const status = req.query.status; // online, offline

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) {
      query.role = role;
    }
    if (status === 'online') {
      query.isOnline = true;
    } else if (status === 'offline') {
      query.isOnline = false;
    }

    const users = await User.find(query)
      .select('name email avatar role isOnline lastSeen createdAt followers following joinedGroups')
      .populate('joinedGroups', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Add additional stats for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const [postsCount, followersCount, followingCount] = await Promise.all([
        Post.countDocuments({ author: user._id, isDeleted: false }),
        user.followers.length,
        user.following.length
      ]);

      return {
        ...user.toObject(),
        stats: {
          postsCount,
          followersCount,
          followingCount,
          groupsCount: user.joinedGroups.length
        }
      };
    }));

    const totalCount = await User.countDocuments(query);

    res.json({
      users: usersWithStats,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single user details (admin view)
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate('followers', 'name avatar')
      .populate('following', 'name avatar')
      .populate('joinedGroups', 'name avatar description memberCount')
      .populate('bookmarkedPosts', 'title author createdAt');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's posts
    const posts = await Post.find({ author: id })
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get user's recent activity
    const recentMessages = await Message.find({ sender: id })
      .populate('group', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get user stats
    const stats = {
      postsCount: await Post.countDocuments({ author: id }),
      deletedPostsCount: await Post.countDocuments({ author: id, isDeleted: true }),
      messagesCount: await Message.countDocuments({ sender: id }),
      followersCount: user.followers.length,
      followingCount: user.following.length,
      groupsCount: user.joinedGroups.length,
      bookmarksCount: user.bookmarkedPosts.length
    };

    res.json({
      user: user.getPublicProfile(),
      posts,
      recentMessages,
      stats
    });
  } catch (error) {
    console.error('Get admin user details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user role
router.put('/users/:id/role', [
  body('role').isIn(['user', 'admin']).withMessage('Invalid role')
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
    const { role } = req.body;

    // Prevent self-demotion from admin
    if (id === req.user._id.toString() && role !== 'admin') {
      return res.status(400).json({ message: 'Cannot demote yourself from admin' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: `User role updated to ${role}`,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Ban/Unban user (soft delete)
router.put('/users/:id/ban', [
  body('banned').isBoolean().withMessage('Banned must be boolean'),
  body('reason').optional().isLength({ max: 500 }).withMessage('Reason too long')
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
    const { banned, reason } = req.body;

    // Prevent self-ban
    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot ban yourself' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent banning other admins
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot ban admin users' });
    }

    // For this example, we'll use a simple banned flag
    // In production, you might want a separate ban collection
    user.isBanned = banned;
    user.banReason = banned ? reason : undefined;
    user.bannedAt = banned ? new Date() : undefined;
    user.bannedBy = banned ? req.user._id : undefined;

    await user.save();

    res.json({
      message: banned ? 'User banned successfully' : 'User unbanned successfully',
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all posts (admin view)
router.get('/posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const status = req.query.status; // active, deleted
    const sort = req.query.sort || 'recent'; // recent, popular, reported

    let query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (status === 'deleted') {
      query.isDeleted = true;
    } else if (status === 'active') {
      query.isDeleted = false;
    }

    let sortQuery;
    switch (sort) {
      case 'popular':
        sortQuery = { likes: -1, views: -1 };
        break;
      default:
        sortQuery = { createdAt: -1 };
    }

    const posts = await Post.find(query)
      .populate('author', 'name email avatar role')
      .populate('group', 'name')
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalCount = await Post.countDocuments(query);

    res.json({
      posts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Get admin posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete post (admin)
router.delete('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.isDeleted = true;
    post.deletedBy = req.user._id;
    post.deletedAt = new Date();
    await post.save();

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Admin delete post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Restore deleted post
router.put('/posts/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.isDeleted = false;
    post.deletedBy = undefined;
    post.deletedAt = undefined;
    await post.save();

    res.json({ message: 'Post restored successfully' });
  } catch (error) {
    console.error('Restore post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all groups (admin view)
router.get('/groups', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const category = req.query.category;

    let query = { isDeleted: false };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (category && category !== 'all') {
      query.category = category;
    }

    const groups = await Group.find(query)
      .populate('owner', 'name email avatar')
      .populate('admins', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Add member count and recent activity
    const groupsWithStats = groups.map(group => ({
      ...group.toObject(),
      memberCount: group.members.length
    }));

    const totalCount = await Group.countDocuments(query);

    res.json({
      groups: groupsWithStats,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Get admin groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get recent activity
router.get('/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Get recent user registrations
    const recentUsers = await User.find()
      .select('name avatar createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get recent posts
    const recentPosts = await Post.find({ isDeleted: false })
      .select('title author createdAt')
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get recent group joins
    const recentGroups = await Group.find({ isDeleted: false })
      .select('name avatar createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      recentUsers,
      recentPosts,
      recentGroups
    });
  } catch (error) {
    console.error('Get admin activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get system logs (placeholder)
router.get('/logs', async (req, res) => {
  try {
    // In a real application, you would implement proper logging
    const logs = [
      {
        id: 1,
        level: 'info',
        message: 'System started',
        timestamp: new Date(),
        metadata: { service: 'api' }
      },
      {
        id: 2,
        level: 'warning',
        message: 'High memory usage detected',
        timestamp: new Date(Date.now() - 60000),
        metadata: { usage: '85%' }
      }
    ];

    res.json({ logs });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;