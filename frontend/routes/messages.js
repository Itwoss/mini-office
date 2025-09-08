import express from 'express';
import { body, validationResult } from 'express-validator';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { authenticateToken, requireGroupMember } from '../middleware/auth.js';
import { uploadMessageAttachment, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

// Get user conversations
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const conversations = await Message.getUserConversations(req.user._id);
    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get conversation messages
router.get('/conversations/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Verify the other user exists
    const otherUser = await User.findById(userId).select('name avatar');
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const messages = await Message.getConversation(req.user._id, userId, page, limit);

    // Mark messages as read
    await Message.updateMany(
      {
        sender: userId,
        recipient: req.user._id,
        'readBy.user': { $ne: req.user._id }
      },
      {
        $push: {
          readBy: { user: req.user._id }
        }
      }
    );

    res.json({
      messages: messages.reverse(),
      otherUser,
      page,
      hasMore: messages.length === limit
    });
  } catch (error) {
    console.error('Get conversation messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send direct message
router.post('/direct', authenticateToken, [
  body('recipient').isMongoId().withMessage('Invalid recipient ID'),
  body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('Message must be 1-2000 characters'),
  body('type').optional().isIn(['text', 'image', 'file']).withMessage('Invalid message type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { recipient, content, type = 'text' } = req.body;

    // Verify recipient exists
    const recipientUser = await User.findById(recipient);
    if (!recipientUser) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    const message = new Message({
      sender: req.user._id,
      recipient,
      content,
      type
    });

    await message.save();
    await message.populate('sender', 'name avatar');

    // Emit real-time message
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${recipient}`).emit('new_message', {
        message,
        conversationId: message.conversation
      });
    }

    res.status(201).json({
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Send direct message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get group messages
router.get('/groups/:groupId', authenticateToken, requireGroupMember(), async (req, res) => {
  try {
    const { groupId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const messages = await Message.getGroupMessages(groupId, page, limit);

    // Mark messages as read
    await Message.updateMany(
      {
        group: groupId,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id }
      },
      {
        $push: {
          readBy: { user: req.user._id }
        }
      }
    );

    res.json({
      messages: messages.reverse(),
      group: req.group,
      page,
      hasMore: messages.length === limit
    });
  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send group message
router.post('/groups/:groupId', authenticateToken, requireGroupMember(), [
  body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('Message must be 1-2000 characters'),
  body('type').optional().isIn(['text', 'image', 'file']).withMessage('Invalid message type'),
  body('replyTo').optional().isMongoId().withMessage('Invalid reply message ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { groupId } = req.params;
    const { content, type = 'text', replyTo } = req.body;

    const messageData = {
      sender: req.user._id,
      group: groupId,
      content,
      type
    };

    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    const message = new Message(messageData);
    await message.save();
    await message.populate([
      { path: 'sender', select: 'name avatar' },
      { path: 'replyTo', select: 'content sender', populate: { path: 'sender', select: 'name' } }
    ]);

    // Update group stats
    await Group.findByIdAndUpdate(groupId, {
      $inc: { 'stats.totalMessages': 1 }
    });

    // Emit real-time message to group members
    const io = req.app.get('io');
    if (io) {
      io.to(`group_${groupId}`).emit('new_group_message', {
        message,
        groupId
      });
    }

    res.status(201).json({
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Send group message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload message attachment
router.post('/attachment', authenticateToken, uploadMessageAttachment.single('file'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const attachment = {
      type: req.file.mimetype.startsWith('image/') ? 'image' : 
            req.file.mimetype.startsWith('video/') ? 'video' : 'document',
      url: req.file.path,
      filename: req.file.originalname,
      size: req.file.size,
      publicId: req.file.filename
    };

    res.json({
      message: 'File uploaded successfully',
      attachment
    });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add reaction to message
router.post('/:messageId/reaction', authenticateToken, [
  body('emoji').trim().isLength({ min: 1, max: 10 }).withMessage('Invalid emoji')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user has access to this message
    const hasAccess = message.sender.toString() === req.user._id.toString() ||
                     message.recipient?.toString() === req.user._id.toString() ||
                     (message.group && await Group.findOne({ 
                       _id: message.group, 
                       'members.user': req.user._id 
                     }));

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const added = await message.addReaction(req.user._id, emoji);
    if (!added) {
      await message.removeReaction(req.user._id, emoji);
    }

    // Emit real-time reaction update
    const io = req.app.get('io');
    if (io) {
      const roomName = message.group ? `group_${message.group}` : `user_${message.recipient}`;
      io.to(roomName).emit('message_reaction', {
        messageId,
        userId: req.user._id,
        emoji,
        added
      });
    }

    res.json({
      message: added ? 'Reaction added' : 'Reaction removed',
      reactions: message.reactions
    });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit message
router.put('/:messageId', authenticateToken, [
  body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('Content must be 1-2000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { messageId } = req.params;
    const { content } = req.body;

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only sender can edit their message
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }

    // Check if message is older than 5 minutes (edit time limit)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (message.createdAt < fiveMinutesAgo) {
      return res.status(400).json({ message: 'Message can only be edited within 5 minutes' });
    }

    await message.editContent(content);

    // Emit real-time edit
    const io = req.app.get('io');
    if (io) {
      const roomName = message.group ? `group_${message.group}` : `user_${message.recipient}`;
      io.to(roomName).emit('message_edited', {
        messageId,
        content,
        editedAt: message.edited.editedAt
      });
    }

    res.json({
      message: 'Message edited successfully',
      data: message
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete message
router.delete('/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only sender can delete their message, or group admin can delete in group
    let canDelete = message.sender.toString() === req.user._id.toString();

    if (message.group && !canDelete) {
      const group = await Group.findById(message.group);
      canDelete = group && group.isAdmin(req.user._id);
    }

    if (!canDelete) {
      return res.status(403).json({ message: 'Access denied' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    // Emit real-time deletion
    const io = req.app.get('io');
    if (io) {
      const roomName = message.group ? `group_${message.group}` : `user_${message.recipient}`;
      io.to(roomName).emit('message_deleted', {
        messageId,
        deletedBy: req.user._id
      });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search messages in conversation
router.get('/search/conversation/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const ids = [req.user._id.toString(), userId.toString()].sort();
    const conversationId = ids.join('_');

    const messages = await Message.find({
      conversation: conversationId,
      content: { $regex: q, $options: 'i' },
      isDeleted: false
    })
    .populate('sender', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const totalCount = await Message.countDocuments({
      conversation: conversationId,
      content: { $regex: q, $options: 'i' },
      isDeleted: false
    });

    res.json({
      messages,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search messages in group
router.get('/search/group/:groupId', authenticateToken, requireGroupMember(), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const messages = await Message.find({
      group: groupId,
      content: { $regex: q, $options: 'i' },
      isDeleted: false
    })
    .populate('sender', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const totalCount = await Message.countDocuments({
      group: groupId,
      content: { $regex: q, $options: 'i' },
      isDeleted: false
    });

    res.json({
      messages,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Search group messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get unread message count
router.get('/unread/count', authenticateToken, async (req, res) => {
  try {
    const unreadCount = await Message.countDocuments({
      $or: [
        { recipient: req.user._id },
        { 
          group: { $in: req.user.joinedGroups },
          sender: { $ne: req.user._id }
        }
      ],
      'readBy.user': { $ne: req.user._id },
      isDeleted: false
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;