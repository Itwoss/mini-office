import express from 'express';
import { body, validationResult } from 'express-validator';
import Group from '../models/Group.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { authenticateToken, requireGroupAdmin, requireGroupMember } from '../middleware/auth.js';
import { uploadGroupAvatar, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

// Get all groups
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;
    const sort = req.query.sort || 'popular'; // popular, recent, members

    let matchQuery = { isDeleted: false };
    if (category && category !== 'all') {
      matchQuery.category = category;
    }

    let sortQuery;
    switch (sort) {
      case 'recent':
        sortQuery = { createdAt: -1 };
        break;
      case 'members':
        sortQuery = { memberCount: -1 };
        break;
      default: // popular
        sortQuery = { 'stats.totalPosts': -1, memberCount: -1 };
    }

    const groups = await Group.find(matchQuery)
      .populate('owner', 'name avatar')
      .populate('members.user', 'name avatar')
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Add member count to each group
    groups.forEach(group => {
      group.memberCount = group.members.length;
    });

    const totalCount = await Group.countDocuments(matchQuery);

    res.json({
      groups,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single group
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id)
      .populate('owner', 'name avatar bio')
      .populate('admins', 'name avatar')
      .populate('members.user', 'name avatar joinedAt')
      .lean();

    if (!group || group.isDeleted) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Get recent posts from this group
    const recentPosts = await Post.find({ 
      group: id, 
      isDeleted: false 
    })
    .populate('author', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(5);

    group.memberCount = group.members.length;
    group.recentPosts = recentPosts;

    res.json({ group });
  } catch (error) {
    console.error('Get single group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join group
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group || group.isDeleted) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const success = await group.addMember(req.user._id);
    if (!success) {
      return res.status(400).json({ 
        message: 'Already a member or group is full' 
      });
    }

    res.json({ message: 'Successfully joined the group' });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Leave group
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group || group.isDeleted) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is the owner
    if (group.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ 
        message: 'Group owner cannot leave the group' 
      });
    }

    await group.removeMember(req.user._id);

    res.json({ message: 'Successfully left the group' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get group posts
router.get('/:id/posts', requireGroupMember(), async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const posts = await Post.find({ 
      group: id, 
      isDeleted: false 
    })
    .populate('author', 'name avatar')
    .populate('comments.author', 'name avatar')
    .populate('likes', 'name')
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

    const totalCount = await Post.countDocuments({ 
      group: id, 
      isDeleted: false 
    });

    res.json({
      posts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Get group posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create post in group
router.post('/:id/posts', authenticateToken, requireGroupMember(), [
  body('title').trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
  body('description').trim().isLength({ min: 1, max: 2000 }).withMessage('Description must be 1-2000 characters'),
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

    // Check if group allows member posts
    if (!req.group.settings.allowMemberPosts && !req.group.isAdmin(req.user._id)) {
      return res.status(403).json({ 
        message: 'Only admins can post in this group' 
      });
    }

    const post = new Post({
      title,
      description,
      link,
      author: req.user._id,
      group: id
    });

    await post.save();
    await post.populate('author', 'name avatar');

    // Update group stats
    await Group.findByIdAndUpdate(id, {
      $inc: { 'stats.totalPosts': 1 }
    });

    res.status(201).json({
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    console.error('Create group post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get group members
router.get('/:id/members', requireGroupMember(), async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const role = req.query.role; // admin, member

    let matchStage = {};
    if (role === 'admin') {
      matchStage = {
        $or: [
          { 'owner': req.user._id },
          { 'admins': req.user._id }
        ]
      };
    }

    const group = await Group.findById(id)
      .populate({
        path: 'members.user',
        select: 'name avatar bio joinedAt isOnline lastSeen'
      })
      .populate('owner', 'name avatar bio')
      .populate('admins', 'name avatar bio');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    let members = group.members.slice((page - 1) * limit, page * limit);

    // Add role information
    members = members.map(member => ({
      ...member.user._doc,
      joinedAt: member.joinedAt,
      role: group.owner._id.toString() === member.user._id.toString() ? 'owner' :
            group.admins.some(admin => admin._id.toString() === member.user._id.toString()) ? 'admin' : 'member'
    }));

    res.json({
      members,
      owner: group.owner,
      admins: group.admins,
      totalCount: group.members.length,
      page,
      totalPages: Math.ceil(group.members.length / limit)
    });
  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Promote user to admin
router.post('/:id/members/:userId/promote', authenticateToken, requireGroupAdmin(), async (req, res) => {
  try {
    const { userId } = req.params;

    const success = await req.group.promoteToAdmin(userId);
    if (!success) {
      return res.status(400).json({ 
        message: 'User is not a member or already an admin' 
      });
    }

    res.json({ message: 'User promoted to admin successfully' });
  } catch (error) {
    console.error('Promote user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Demote admin to member
router.post('/:id/members/:userId/demote', authenticateToken, requireGroupAdmin(), async (req, res) => {
  try {
    const { userId } = req.params;

    // Can't demote the owner
    if (req.group.owner.toString() === userId) {
      return res.status(400).json({ message: 'Cannot demote group owner' });
    }

    const success = await req.group.demoteFromAdmin(userId);
    if (!success) {
      return res.status(400).json({ message: 'User is not an admin' });
    }

    res.json({ message: 'User demoted to member successfully' });
  } catch (error) {
    console.error('Demote user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove member from group
router.delete('/:id/members/:userId', authenticateToken, requireGroupAdmin(), async (req, res) => {
  try {
    const { userId } = req.params;

    // Can't remove the owner
    if (req.group.owner.toString() === userId) {
      return res.status(400).json({ message: 'Cannot remove group owner' });
    }

    await req.group.removeMember(userId);

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update group settings
router.put('/:id/settings', authenticateToken, requireGroupAdmin(), [
  body('allowMemberPosts').optional().isBoolean(),
  body('requireApproval').optional().isBoolean(),
  body('allowInvites').optional().isBoolean(),
  body('maxMembers').optional().isInt({ min: 10, max: 10000 })
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
    const { allowMemberPosts, requireApproval, allowInvites, maxMembers } = req.body;

    const updateData = {};
    if (allowMemberPosts !== undefined) updateData['settings.allowMemberPosts'] = allowMemberPosts;
    if (requireApproval !== undefined) updateData['settings.requireApproval'] = requireApproval;
    if (allowInvites !== undefined) updateData['settings.allowInvites'] = allowInvites;
    if (maxMembers !== undefined) updateData.maxMembers = maxMembers;

    const group = await Group.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Group settings updated successfully',
      group
    });
  } catch (error) {
    console.error('Update group settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update group info
router.put('/:id', authenticateToken, requireGroupAdmin(), [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('description').optional().trim().isLength({ min: 10, max: 500 }).withMessage('Description must be 10-500 characters'),
  body('category').optional().isIn(['general', 'technology', 'business', 'creative', 'social', 'gaming'])
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
    const { name, description, category } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (category) updateData.category = category;

    const group = await Group.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('owner', 'name avatar');

    res.json({
      message: 'Group updated successfully',
      group
    });
  } catch (error) {
    console.error('Update group error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Group name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload group avatar
router.post('/:id/avatar', authenticateToken, requireGroupAdmin(), uploadGroupAvatar.single('avatar'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { id } = req.params;
    const group = await Group.findByIdAndUpdate(
      id,
      { avatar: req.file.path },
      { new: true }
    );

    res.json({
      message: 'Group avatar updated successfully',
      avatar: group.avatar
    });
  } catch (error) {
    console.error('Group avatar upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search groups
router.get('/search/groups', async (req, res) => {
  try {
    const { q, category, page = 1, limit = 20 } = req.query;
    
    let searchQuery = { isDeleted: false, isPrivate: false };

    if (q && q.trim().length >= 2) {
      searchQuery.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      searchQuery.category = category;
    }

    const groups = await Group.find(searchQuery)
      .populate('owner', 'name avatar')
      .sort({ memberCount: -1, 'stats.totalPosts': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalCount = await Group.countDocuments(searchQuery);

    res.json({
      groups,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Search groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get popular groups
router.get('/popular/groups', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const groups = await Group.getPopular(limit);

    res.json({
      groups,
      totalCount: groups.length
    });
  } catch (error) {
    console.error('Get popular groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;