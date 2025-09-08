import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    maxlength: [500, 'Comment cannot be more than 500 characters']
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  replies: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: [500, 'Reply cannot be more than 500 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Post title is required'],
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Post description is required'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  images: [{
    url: String,
    publicId: String // For Cloudinary
  }],
  link: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Link must be a valid URL'
    }
  },
  hashtags: [{
    type: String,
    lowercase: true
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [commentSchema],
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ group: 1, createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ title: 'text', description: 'text' });
postSchema.index({ createdAt: -1 });

// Virtual for like count
postSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

// Virtual for comment count
postSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Extract hashtags from description
postSchema.pre('save', function(next) {
  if (this.isModified('description')) {
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    const hashtags = this.description.match(hashtagRegex) || [];
    this.hashtags = [...new Set(hashtags.map(tag => tag.toLowerCase().replace('#', '')))];
  }
  next();
});

// Method to add like
postSchema.methods.addLike = async function(userId) {
  if (!this.likes.includes(userId)) {
    this.likes.push(userId);
    await this.save();
    return true;
  }
  return false;
};

// Method to remove like
postSchema.methods.removeLike = async function(userId) {
  const index = this.likes.indexOf(userId);
  if (index > -1) {
    this.likes.splice(index, 1);
    await this.save();
    return true;
  }
  return false;
};

// Method to add comment
postSchema.methods.addComment = async function(userId, content) {
  this.comments.push({
    author: userId,
    content: content
  });
  await this.save();
  return this.comments[this.comments.length - 1];
};

// Method to get trending posts
postSchema.statics.getTrending = async function(limit = 10) {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: threeDaysAgo },
        isDeleted: false
      }
    },
    {
      $addFields: {
        score: {
          $add: [
            { $multiply: [{ $size: '$likes' }, 2] },
            { $size: '$comments' },
            { $divide: ['$views', 10] }
          ]
        }
      }
    },
    { $sort: { score: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        as: 'author'
      }
    },
    { $unwind: '$author' },
    {
      $project: {
        'author.password': 0,
        'author.email': 0
      }
    }
  ]);
};

export default mongoose.model('Post', postSchema);