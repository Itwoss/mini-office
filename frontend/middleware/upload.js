import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage for avatars
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mini-office/avatars',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [
      { width: 300, height: 300, crop: 'fill', gravity: 'face' }
    ]
  }
});

// Cloudinary storage for post images
const postImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mini-office/posts',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit', quality: 'auto' }
    ]
  }
});

// Cloudinary storage for group avatars
const groupAvatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mini-office/groups',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [
      { width: 300, height: 300, crop: 'fill' }
    ]
  }
});

// Cloudinary storage for message attachments
const messageAttachmentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mini-office/messages',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif', 'pdf', 'doc', 'docx'],
    resource_type: 'auto'
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, JPG, PNG, GIF, WebP)'));
  }
};

// Document filter function
const documentFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  if (extname) {
    return cb(null, true);
  } else {
    cb(new Error('File type not allowed'));
  }
};

// Multer configurations
export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

export const uploadPostImages = multer({
  storage: postImageStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5 // Maximum 5 files
  },
  fileFilter: fileFilter
});

export const uploadGroupAvatar = multer({
  storage: groupAvatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

export const uploadMessageAttachment = multer({
  storage: messageAttachmentStorage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  },
  fileFilter: documentFilter
});

// Error handling middleware for multer
export const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Unexpected file field' });
    }
  }
  
  if (error.message) {
    return res.status(400).json({ message: error.message });
  }
  
  next(error);
};

// Helper function to delete file from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

// Helper function to get optimized image URL
export const getOptimizedImageUrl = (publicId, options = {}) => {
  const defaultOptions = {
    quality: 'auto',
    fetch_format: 'auto'
  };
  
  return cloudinary.url(publicId, { ...defaultOptions, ...options });
};
