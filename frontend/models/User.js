import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  avatar: {
    type: String,
    default: 'https://res.cloudinary.com/demo/image/upload/w_150,h_150,c_thumb,g_face/avatar-placeholder.png'
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot be more than 500 characters'],
    default: ''
  },
  externalLink: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  joinedGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  bookmarkedPosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  notifications: [{
    type: {
      type: String,
      enum: ['like', 'comment', 'follow', 'message', 'group_invite'],
      required: true
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post'
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group'
    },
    message: String,
    read: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ name: 'text', bio: 'text' });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Get public profile
userSchema.methods.getPublicProfile = function() {
  const { password, __v, ...publicProfile } = this.toObject();
  return publicProfile;
};

// Follow/Unfollow methods
userSchema.methods.follow = async function(userId) {
  if (!this.following.includes(userId)) {
    this.following.push(userId);
    await this.save();
    
    // Add to follower's followers list
    await this.model('User').findByIdAndUpdate(userId, {
      $addToSet: { followers: this._id }
    });
  }
};

userSchema.methods.unfollow = async function(userId) {
  this.following.pull(userId);
  await this.save();
  
  // Remove from follower's followers list
  await this.model('User').findByIdAndUpdate(userId, {
    $pull: { followers: this._id }
  });
};

// Add notification method
userSchema.methods.addNotification = async function(notification) {
  this.notifications.unshift(notification);
  if (this.notifications.length > 50) {
    this.notifications = this.notifications.slice(0, 50);
  }
  await this.save();
};

export default mongoose.model('User', userSchema);