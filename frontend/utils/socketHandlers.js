import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Group from '../models/Group.js';

const connectedUsers = new Map();

export const handleConnection = (socket, io) => {
  console.log('New socket connection:', socket.id);

  // Authenticate socket connection
  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      if (!token) {
        socket.emit('auth_error', { message: 'Token required' });
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        socket.emit('auth_error', { message: 'User not found' });
        return;
      }

      socket.userId = user._id.toString();
      socket.user = user;

      // Store user connection
      connectedUsers.set(socket.userId, {
        socketId: socket.id,
        user: user,
        lastSeen: new Date()
      });

      // Update user online status
      await User.findByIdAndUpdate(user._id, { 
        isOnline: true, 
        lastSeen: new Date() 
      });

      // Join user to their personal room
      socket.join(`user_${user._id}`);

      // Join user to their group rooms
      if (user.joinedGroups && user.joinedGroups.length > 0) {
        user.joinedGroups.forEach(groupId => {
          socket.join(`group_${groupId}`);
        });
      }

      socket.emit('authenticated', { 
        message: 'Authentication successful',
        user: user.getPublicProfile()
      });

      // Notify friends about user coming online
      socket.broadcast.emit('user_online', {
        userId: user._id,
        name: user.name,
        avatar: user.avatar
      });

      console.log(`User ${user.name} connected with socket ${socket.id}`);

    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('auth_error', { message: 'Authentication failed' });
    }
  });

  // Handle joining group rooms
  socket.on('join_group', async (data) => {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { groupId } = data;
      const group = await Group.findById(groupId);
      
      if (!group || !group.isMember(socket.userId)) {
        socket.emit('error', { message: 'Access denied to group' });
        return;
      }

      socket.join(`group_${groupId}`);
      socket.emit('joined_group', { groupId, groupName: group.name });

    } catch (error) {
      console.error('Join group error:', error);
      socket.emit('error', { message: 'Failed to join group' });
    }
  });

  // Handle leaving group rooms
  socket.on('leave_group', (data) => {
    try {
      const { groupId } = data;
      socket.leave(`group_${groupId}`);
      socket.emit('left_group', { groupId });
    } catch (error) {
      console.error('Leave group error:', error);
    }
  });

  // Handle direct message
  socket.on('send_message', async (data) => {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { recipientId, content, type = 'text' } = data;

      // Verify recipient exists
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        socket.emit('error', { message: 'Recipient not found' });
        return;
      }

      const Message = (await import('../models/Message.js')).default;
      
      const message = new Message({
        sender: socket.userId,
        recipient: recipientId,
        content,
        type
      });

      await message.save();
      await message.populate('sender', 'name avatar');

      // Send to recipient if online
      socket.to(`user_${recipientId}`).emit('new_message', {
        message,
        conversationId: message.conversation
      });

      // Confirm to sender
      socket.emit('message_sent', {
        message,
        conversationId: message.conversation
      });

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle group message
  socket.on('send_group_message', async (data) => {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { groupId, content, type = 'text', replyTo } = data;

      const group = await Group.findById(groupId);
      if (!group || !group.isMember(socket.userId)) {
        socket.emit('error', { message: 'Access denied to group' });
        return;
      }

      const Message = (await import('../models/Message.js')).default;
      
      const messageData = {
        sender: socket.userId,
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

      // Send to all group members
      socket.to(`group_${groupId}`).emit('new_group_message', {
        message,
        groupId
      });

      // Confirm to sender
      socket.emit('group_message_sent', {
        message,
        groupId
      });

    } catch (error) {
      console.error('Send group message error:', error);
      socket.emit('error', { message: 'Failed to send group message' });
    }
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    try {
      if (!socket.userId) return;

      const { conversationId, groupId, recipientId } = data;

      if (groupId) {
        socket.to(`group_${groupId}`).emit('user_typing', {
          userId: socket.userId,
          userName: socket.user.name,
          groupId
        });
      } else if (recipientId) {
        socket.to(`user_${recipientId}`).emit('user_typing', {
          userId: socket.userId,
          userName: socket.user.name,
          conversationId
        });
      }

    } catch (error) {
      console.error('Typing start error:', error);
    }
  });

  socket.on('typing_stop', (data) => {
    try {
      if (!socket.userId) return;

      const { conversationId, groupId, recipientId } = data;

      if (groupId) {
        socket.to(`group_${groupId}`).emit('user_stop_typing', {
          userId: socket.userId,
          groupId
        });
      } else if (recipientId) {
        socket.to(`user_${recipientId}`).emit('user_stop_typing', {
          userId: socket.userId,
          conversationId
        });
      }

    } catch (error) {
      console.error('Typing stop error:', error);
    }
  });

  // Handle message read receipts
  socket.on('mark_as_read', async (data) => {
    try {
      if (!socket.userId) return;

      const { messageId, conversationId, groupId } = data;
      const Message = (await import('../models/Message.js')).default;

      const message = await Message.findById(messageId);
      if (message) {
        await message.markAsRead(socket.userId);

        // Notify sender about read receipt
        if (groupId) {
          socket.to(`group_${groupId}`).emit('message_read', {
            messageId,
            readBy: socket.userId,
            groupId
          });
        } else {
          socket.to(`user_${message.sender}`).emit('message_read', {
            messageId,
            readBy: socket.userId,
            conversationId
          });
        }
      }

    } catch (error) {
      console.error('Mark as read error:', error);
    }
  });

  // Handle user status updates
  socket.on('update_status', async (data) => {
    try {
      if (!socket.userId) return;

      const { status } = data; // online, away, busy, offline

      await User.findByIdAndUpdate(socket.userId, {
        status,
        lastSeen: new Date()
      });

      // Broadcast status update
      socket.broadcast.emit('user_status_update', {
        userId: socket.userId,
        status
      });

    } catch (error) {
      console.error('Update status error:', error);
    }
  });

  // Handle real-time notifications
  socket.on('send_notification', (data) => {
    try {
      const { recipientId, notification } = data;

      if (recipientId && notification) {
        socket.to(`user_${recipientId}`).emit('new_notification', notification);
      }

    } catch (error) {
      console.error('Send notification error:', error);
    }
  });

  // Handle voice/video call signaling (placeholder for future implementation)
  socket.on('call_user', (data) => {
    try {
      if (!socket.userId) return;

      const { recipientId, callType, offer } = data;

      socket.to(`user_${recipientId}`).emit('incoming_call', {
        from: socket.userId,
        caller: socket.user.name,
        callType,
        offer
      });

    } catch (error) {
      console.error('Call user error:', error);
    }
  });

  socket.on('answer_call', (data) => {
    try {
      const { callerId, answer } = data;

      socket.to(`user_${callerId}`).emit('call_answered', {
        from: socket.userId,
        answer
      });

    } catch (error) {
      console.error('Answer call error:', error);
    }
  });

  socket.on('end_call', (data) => {
    try {
      const { recipientId } = data;

      socket.to(`user_${recipientId}`).emit('call_ended', {
        from: socket.userId
      });

    } catch (error) {
      console.error('End call error:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    try {
      if (socket.userId) {
        console.log(`User ${socket.user?.name} disconnected`);

        // Remove from connected users
        connectedUsers.delete(socket.userId);

        // Update user offline status
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date()
        });

        // Notify others about user going offline
        socket.broadcast.emit('user_offline', {
          userId: socket.userId,
          lastSeen: new Date()
        });
      }
    } catch (error) {
      console.error('Disconnect handling error:', error);
    }
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
};

// Helper functions
export const getConnectedUsers = () => {
  return Array.from(connectedUsers.values()).map(connection => ({
    userId: connection.user._id,
    name: connection.user.name,
    avatar: connection.user.avatar,
    lastSeen: connection.lastSeen
  }));
};

export const getUserSocketId = (userId) => {
  const connection = connectedUsers.get(userId.toString());
  return connection ? connection.socketId : null;
};

export const isUserOnline = (userId) => {
  return connectedUsers.has(userId.toString());
};