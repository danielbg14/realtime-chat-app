const jwt = require('jsonwebtoken');
const { log, error: debugError, warn } = require('../debug');

/**
 * Middleware to verify JWT token from request headers
 * Expected header format: Authorization: Bearer <token>
 * Attaches decoded user info to req.user
 */
const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login first.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    debugError('Token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please login again.',
    });
  }
};

/**
 * Generate JWT token for a user
 * @param {string} userId - MongoDB user ID
 * @param {string} username - User's username
 * @returns {string} JWT token
 */
const generateToken = (userId, username) => {
  return jwt.sign(
    { userId, username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/**
 * Extract and verify token from Socket.IO handshake
 * Client should send token in auth object: {token: 'jwt_token_here'}
 * @param {object} socket - Socket.IO socket object
 * @returns {object|null} Decoded token or null if invalid
 */
const verifySocketToken = (socket) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      debugError('Socket connection: No token provided');
      return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    log(`Socket authenticated: ${decoded.username}`);
    return decoded;
  } catch (error) {
    debugError('Socket token verification failed:', error.message);
    return null;
  }
};

module.exports = {
  verifyToken,
  generateToken,
  verifySocketToken,
};
