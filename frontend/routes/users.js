import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Post from '../models/Post.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAvatar, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

// Get user profile
router.get('/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id)
      .populate('followers', 'name avatar')
      .populate('following', 'name avatar')
      .populate('joinedGroups', 'name avatar description memberCount')
      .select('-password -email');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's posts
    const posts = await Post.find({ 
      author: id, 
      isDeleted: false 
    })
    .populate('author', 'name avatar')
    .populate('comments.author', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(20);

    // Get user stats
    const stats = {
      postsCount: await Post.countDocuments({ author: id, isDeleted: false }),
      followersCount: user.followers.length,
      followingCount: user.following.length,
      groupsCount: user.joinedGroups.length
    };

    res.json({
      user: user.getPublicProfile(),
      posts,
      stats
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio cannot be more than 500 characters'),
  body('externalLink').optional().isURL().withMessage('External link must be a valid URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { name, bio, externalLink } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (externalLink !== undefined) updateData.externalLink = externalLink;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload avatar
router.post('/avatar', authenticateToken, uploadAvatar.single('avatar'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: req.file.path },
      { new: true }
    ).select('-password');

    res.json({
      message: 'Avatar updated successfully',
      avatar: user.avatar,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Follow user
router.post('/follow/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const userToFollow = await User.findById(id);
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }

    await req.user.follow(id);
    
    // Add notification to the followed user
    await userToFollow.addNotification({
      type: 'follow',
      from: req.user._id,
      message: `${req.user.name} started following you`
    });

    res.json({ message: 'User followed successfully' });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unfollow user
router.delete('/follow/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await req.user.unfollow(id);
    
    res.json({ message: 'User unfollowed successfully' });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user followers
router.get('/:id/followers', async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const user = await User.findById(id)
      .populate({
        path: 'followers',
        select: 'name avatar bio followersCount',
        options: {
          limit: limit,
          skip: (page - 1) * limit
        }
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      followers: user.followers,
      totalCount: user.followers.length,
      page,
      totalPages: Math.ceil(user.followers.length / limit)
    });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user following
router.get('/:id/following', async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const user = await User.findById(id)
      .populate({
        path: 'following',
        select: 'name avatar bio followersCount',
        options: {
          limit: limit,
          skip: (page - 1) * limit
        }
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      following: user.following,
      totalCount: user.following.length,
      page,
      totalPages: Math.ceil(user.following.length / limit)
    });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search users
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { bio: { $regex: q, $options: 'i' } }
      ]
    })
    .select('name avatar bio followersCount followingCount')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ followersCount: -1 });

    const totalCount = await User.countDocuments({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { bio: { $regex: q, $options: 'i' } }
      ]
    });

    res.json({
      users,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const user = await User.findById(req.user._id)
      .populate({
        path: 'notifications.from',
        select: 'name avatar'
      })
      .populate({
        path: 'notifications.post',
        select: 'title images'
      })
      .populate({
        path: 'notifications.group',
        select: 'name avatar'
      });

    const notifications = user.notifications
      .slice((page - 1) * limit, page * limit);

    res.json({
      notifications,
      totalCount: user.notifications.length,
      unreadCount: user.notifications.filter(n => !n.read).length,
      page,
      totalPages: Math.ceil(user.notifications.length / limit)
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark notification as read
router.put('/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const user = await User.findById(req.user._id);
    const notification = user.notifications.id(notificationId);
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.read = true;
    await user.save();

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark all notifications as read
router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    user.notifications.forEach(notification => {
      notification.read = true;
    });
    
    await user.save();

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get suggested users to follow
router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Get users that the current user is not following
    const suggestions = await User.find({
      _id: { 
        $ne: req.user._id,
        $nin: req.user.following
      }
    })
    .select('name avatar bio followersCount')
    .sort({ followersCount: -1 })
    .limit(limit);

    res.json({ suggestions });
  } catch (error) {
    console.error('Get user suggestions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;