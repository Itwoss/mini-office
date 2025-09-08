import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Group name is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Group name cannot be more than 50 characters']
  },
  description: {
    type: String,
    required: [true, 'Group description is required'],
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  avatar: {
    type: String,
    default: 'https://res.cloudinary.com/demo/image/upload/w_150,h_150,c_thumb,g_face/group-placeholder.png'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['member', 'moderator'],
      default: 'member'
    }
  }],
  category: {
    type: String,
    enum: ['general', 'technology', 'business', 'creative', 'social', 'gaming'],
    default: 'general'
  },
  tags: [{
    type: String,
    lowercase: true
  }],
  isPrivate: {
    type: Boolean,
    default: false
  },
  maxMembers: {
    type: Number,
    default: 1000
  },
  rules: [{
    title: String,
    description: String
  }],
  stats: {
    totalPosts: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    activeMembers: {
      type: Number,
      default: 0
    }
  },
  settings: {
    allowMemberPosts: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    allowInvites: {
      type: Boolean,
      default: true
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
groupSchema.index({ name: 1 });
groupSchema.index({ category: 1 });
groupSchema.index({ tags: 1 });
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ name: 'text', description: 'text' });

// Virtual for member count
groupSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Method to add member
groupSchema.methods.addMember = async function(userId, role = 'member') {
  const existingMember = this.members.find(m => m.user.toString() === userId.toString());
  if (!existingMember && this.members.length < this.maxMembers) {
    this.members.push({ user: userId, role });
    await this.save();
    
    // Add group to user's joinedGroups
    await this.model('User').findByIdAndUpdate(userId, {
      $addToSet: { joinedGroups: this._id }
    });
    
    return true;
  }
  return false;
};

// Method to remove member
groupSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(m => m.user.toString() !== userId.toString());
  await this.save();
  
  // Remove group from user's joinedGroups
  await this.model('User').findByIdAndUpdate(userId, {
    $pull: { joinedGroups: this._id }
  });
};

// Method to check if user is member
groupSchema.methods.isMember = function(userId) {
  return this.members.some(m => m.user.toString() === userId.toString());
};

// Method to check if user is admin
groupSchema.methods.isAdmin = function(userId) {
  return this.owner.toString() === userId.toString() || 
         this.admins.some(admin => admin.toString() === userId.toString());
};

// Method to promote member to admin
groupSchema.methods.promoteToAdmin = async function(userId) {
  if (this.isMember(userId) && !this.admins.includes(userId)) {
    this.admins.push(userId);
    await this.save();
    return true;
  }
  return false;
};

// Method to demote admin to member
groupSchema.methods.demoteFromAdmin = async function(userId) {
  const index = this.admins.indexOf(userId);
  if (index > -1) {
    this.admins.splice(index, 1);
    await this.save();
    return true;
  }
  return false;
};

// Static method to get popular groups
groupSchema.statics.getPopular = async function(limit = 10) {
  return this.aggregate([
    { $match: { isDeleted: false, isPrivate: false } },
    {
      $addFields: {
        memberCount: { $size: '$members' },
        score: {
          $add: [
            { $multiply: [{ $size: '$members' }, 2] },
            '$stats.totalPosts',
            { $divide: ['$stats.totalMessages', 10] }
          ]
        }
      }
    },
    { $sort: { score: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'owner',
        foreignField: '_id',
        as: 'owner'
      }
    },
    { $unwind: '$owner' },
    {
      $project: {
        'owner.password': 0,
        'owner.email': 0
      }
    }
  ]);
};

export default mongoose.model('Group', groupSchema);