const express = require('express');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { log, error: debugError } = require('../debug');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 * Body: { username, password }
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username already taken',
      });
    }

    // Create new user (password hashing happens in User model)
    const newUser = new User({ username, password });
    await newUser.save();

    // Generate JWT token
    const token = generateToken(newUser._id, newUser.username);

    log(`New user registered: ${username}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    debugError('Registration error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/auth/login
 * Login a user
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    // Find user by username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    // Check password
    const isPasswordValid = await user.checkPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    // Generate JWT token
    const token = generateToken(user._id, user.username);

    log(`User logged in: ${username}`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    debugError('Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user info
 * Requires valid JWT token in Authorization header
 */
router.get('/me', require('../middleware/auth').verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    debugError('Get user info error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get user info',
    });
  }
});

module.exports = router;
