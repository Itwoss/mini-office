import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { authenticateToken, generateTokens } from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Create new user
    const user = new User({ name, email, password });
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Return user data without password
    const userData = user.getPublicProfile();

    res.status(201).json({
      message: 'User registered successfully',
      user: userData,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update user online status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Return user data without password
    const userData = user.getPublicProfile();

    res.json({
      message: 'Login successful',
      user: userData,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Update user online status
    req.user.isOnline = false;
    req.user.lastSeen = new Date();
    await req.user.save();

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('followers', 'name avatar')
      .populate('following', 'name avatar')
      .populate('joinedGroups', 'name avatar memberCount')
      .select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: user.getPublicProfile() });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    // Verify refresh token
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET + '_refresh');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Generate new tokens
    const tokens = generateTokens(user._id);
    
    res.json({
      message: 'Token refreshed successfully',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// Verify email (placeholder for future implementation)
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    
    // TODO: Implement email verification logic
    res.json({ message: 'Email verification not implemented yet' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ message: 'Server error during email verification' });
  }
});

// Request password reset
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if user exists or not
      return res.json({ message: 'If an account exists, a password reset email will be sent' });
    }

    // TODO: Implement password reset email logic
    res.json({ message: 'Password reset functionality not implemented yet' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset password
router.post('/reset-password', [
  body('token').exists().withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { token, password } = req.body;
    
    // TODO: Implement password reset logic
    res.json({ message: 'Password reset functionality not implemented yet' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

export default router;