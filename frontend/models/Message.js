import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [2000, 'Message cannot be more than 2000 characters']
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'video', 'document', 'audio']
    },
    url: String,
    filename: String,
    size: Number,
    publicId: String // For Cloudinary
  }],
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  conversation: {
    type: String, // Generated conversation ID for direct messages
    default: null
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  edited: {
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: Date,
    originalContent: String
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  metadata: {
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    links: [{
      url: String,
      title: String,
      description: String,
      image: String
    }]
  }
}, {
  timestamps: true
});

// Indexes for performance
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ group: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, createdAt: -1 });
messageSchema.index({ 'metadata.mentions': 1 });

// Generate conversation ID for direct messages
messageSchema.pre('save', function(next) {
  if (!this.group && this.recipient) {
    const ids = [this.sender.toString(), this.recipient.toString()].sort();
    this.conversation = ids.join('_');
  }
  
  // Extract mentions from content
  if (this.isModified('content')) {
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const mentions = this.content.match(mentionRegex) || [];
    // Note: In a real app, you'd need to resolve usernames to user IDs
    this.metadata.mentions = [];
  }
  
  next();
});

// Method to add reaction
messageSchema.methods.addReaction = async function(userId, emoji) {
  const existingReaction = this.reactions.find(r => 
    r.user.toString() === userId.toString() && r.emoji === emoji
  );
  
  if (!existingReaction) {
    this.reactions.push({ user: userId, emoji });
    await this.save();
    return true;
  }
  return false;
};

// Method to remove reaction
messageSchema.methods.removeReaction = async function(userId, emoji) {
  this.reactions = this.reactions.filter(r => 
    !(r.user.toString() === userId.toString() && r.emoji === emoji)
  );
  await this.save();
};

// Method to mark as read
messageSchema.methods.markAsRead = async function(userId) {
  const alreadyRead = this.readBy.some(r => r.user.toString() === userId.toString());
  if (!alreadyRead) {
    this.readBy.push({ user: userId });
    await this.save();
  }
};

// Method to edit message
messageSchema.methods.editContent = async function(newContent) {
  if (!this.edited.isEdited) {
    this.edited.originalContent = this.content;
  }
  this.content = newContent;
  this.edited.isEdited = true;
  this.edited.editedAt = new Date();
  await this.save();
};

// Static method to get conversation messages
messageSchema.statics.getConversation = async function(userId1, userId2, page = 1, limit = 50) {
  const ids = [userId1.toString(), userId2.toString()].sort();
  const conversationId = ids.join('_');
  
  return this.find({
    conversation: conversationId,
    isDeleted: false
  })
  .populate('sender', 'name avatar')
  .populate('replyTo', 'content sender')
  .sort({ createdAt: -1 })
  .limit(limit * page)
  .skip((page - 1) * limit);
};

// Static method to get group messages
messageSchema.statics.getGroupMessages = async function(groupId, page = 1, limit = 50) {
  return this.find({
    group: groupId,
    isDeleted: false
  })
  .populate('sender', 'name avatar')
  .populate('replyTo', 'content sender')
  .sort({ createdAt: -1 })
  .limit(limit * page)
  .skip((page - 1) * limit);
};

// Static method to get user conversations
messageSchema.statics.getUserConversations = async function(userId) {
  return this.aggregate([
    {
      $match: {
        $or: [
          { sender: mongoose.Types.ObjectId(userId) },
          { recipient: mongoose.Types.ObjectId(userId) }
        ],
        group: null,
        isDeleted: false
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $group: {
        _id: '$conversation',
        lastMessage: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$sender', mongoose.Types.ObjectId(userId)] },
                  { $not: { $in: [mongoose.Types.ObjectId(userId), '$readBy.user'] } }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'lastMessage.sender',
        foreignField: '_id',
        as: 'lastMessage.sender'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'lastMessage.recipient',
        foreignField: '_id',
        as: 'lastMessage.recipient'
      }
    },
    { $unwind: '$lastMessage.sender' },
    { $unwind: '$lastMessage.recipient' },
    {
      $project: {
        'lastMessage.sender.password': 0,
        'lastMessage.recipient.password': 0
      }
    },
    {
      $sort: { 'lastMessage.createdAt': -1 }
    }
  ]);
};

export default mongoose.model('Message', messageSchema);