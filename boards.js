/**
 * In-Memory Whiteboard Board Storage
 * Stores drawing strokes per room
 * 
 * Stroke object structure:
 * {
 *   x0: number,
 *   y0: number,
 *   x1: number,
 *   y1: number,
 *   color: string (hex color),
 *   size: number (brush size),
 *   userId: string (socket id),
 *   username: string,
 *   timestamp: Date
 * }
 */

const { log, warn } = require('./debug');

class BoardManager {
  constructor() {
    // Format: { roomName: [stroke1, stroke2, ...], ... }
    this.boards = {};
    
    // Track maximum strokes per room to prevent memory abuse
    this.MAX_STROKES_PER_ROOM = 5000;
  }

  /**
   * Add a stroke to a room's board
   * @param {string} room - Room name
   * @param {Object} stroke - Stroke data with x0, y0, x1, y1, color, size, userId, username
   * @returns {boolean} - Whether stroke was added successfully
   */
  addStroke(room, stroke) {
    if (!room || typeof room !== 'string') {
      warn('❌ Invalid room in addStroke');
      return false;
    }

    // Validate stroke data
    if (!this.validateStroke(stroke)) {
      warn('❌ Invalid stroke data');
      return false;
    }

    // Initialize room board if it doesn't exist
    if (!this.boards[room]) {
      this.boards[room] = [];
    }

    // Check if room is at max capacity
    if (this.boards[room].length >= this.MAX_STROKES_PER_ROOM) {
      warn(`⚠️  Room '${room}' has reached max strokes. Removing oldest stroke.`);
      this.boards[room].shift(); // Remove oldest stroke
    }

    // Add timestamp if not present
    if (!stroke.timestamp) {
      stroke.timestamp = new Date();
    }

    this.boards[room].push(stroke);
    return true;
  }

  /**
   * Get all strokes for a room
   * @param {string} room - Room name
   * @returns {Array} - Array of stroke objects
   */
  getBoard(room) {
    if (!room || typeof room !== 'string') {
      return [];
    }

    return this.boards[room] || [];
  }

  /**
   * Clear all strokes from a room
   * @param {string} room - Room name
   * @returns {boolean} - Whether clear was successful
   */
  clearBoard(room) {
    if (!room || typeof room !== 'string') {
      return false;
    }

    if (this.boards[room]) {
      this.boards[room] = [];
      return true;
    }

    return false;
  }

  /**
   * Remove all strokes from a specific user (undo support)
   * @param {string} room - Room name
   * @param {string} userId - Socket ID of user
   * @returns {number} - Number of strokes removed
   */
  removeUserStrokes(room, userId) {
    if (!room || !userId || !this.boards[room]) {
      return 0;
    }

    const originalLength = this.boards[room].length;
    this.boards[room] = this.boards[room].filter(stroke => stroke.userId !== userId);
    
    return originalLength - this.boards[room].length;
  }

  /**
   * Remove only the LAST stroke from a specific user (true undo)
   * @param {string} room - Room name
   * @param {string} userId - Socket ID of user
   * @returns {boolean} - Whether a stroke was removed
   */
  removeLastUserStroke(room, userId) {
    if (!room || !userId || !this.boards[room]) {
      return false;
    }

    log(`🔍 Looking for stroke to remove in room "${room}", userId="${userId}"`);
    log(`   Current board has ${this.boards[room].length} strokes`);

    // Find the last stroke ID from this user (by finding the last segment with that user)
    let lastStrokeId = null;
    for (let i = this.boards[room].length - 1; i >= 0; i--) {
      if (this.boards[room][i].userId === userId) {
        lastStrokeId = this.boards[room][i].strokeId;
        log(`   Found last stroke ID: ${lastStrokeId}`);
        break;
      }
    }

    if (!lastStrokeId) {
      log(`   ✗ No stroke found for user`);
      return false;
    }

    // Remove all segments with that strokeId
    const initialLength = this.boards[room].length;
    this.boards[room] = this.boards[room].filter(segment => !(segment.userId === userId && segment.strokeId === lastStrokeId));
    const removedCount = initialLength - this.boards[room].length;

    log(`   ✓ Removed ${removedCount} segments of stroke ${lastStrokeId}`);
    log(`   ✓ Board now has ${this.boards[room].length} strokes`);
    
    return removedCount > 0;
  }

  /**
   * Get statistics about a board
   * @param {string} room - Room name
   * @returns {Object} - Stats object
   */
  getBoardStats(room) {
    const strokes = this.getBoard(room);
    
    if (strokes.length === 0) {
      return {
        room,
        strokeCount: 0,
        users: [],
        isEmpty: true,
      };
    }

    const uniqueUsers = [...new Set(strokes.map(s => s.userId))];

    return {
      room,
      strokeCount: strokes.length,
      users: uniqueUsers,
      maxCapacity: this.MAX_STROKES_PER_ROOM,
      isFull: strokes.length >= this.MAX_STROKES_PER_ROOM,
      isEmpty: false,
    };
  }

  /**
   * Delete a room's board (cleanup)
   * @param {string} room - Room name
   */
  deleteBoard(room) {
    if (this.boards[room]) {
      delete this.boards[room];
    }
  }

  /**
   * Validate stroke data
   * @private
   * @param {Object} stroke - Stroke to validate
   * @returns {boolean}
   */
  validateStroke(stroke) {
    if (!stroke || typeof stroke !== 'object') {
      return false;
    }

    const { x0, y0, x1, y1, color, size, userId, username } = stroke;

    // Check all required fields exist
    if (x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined) {
      return false;
    }

    // Check numeric values
    if (typeof x0 !== 'number' || typeof y0 !== 'number' ||
        typeof x1 !== 'number' || typeof y1 !== 'number') {
      return false;
    }

    // Prevent NaN or Infinity
    if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) {
      return false;
    }

    // Validate color (should be hex or rgb)
    if (typeof color !== 'string' || color.length === 0) {
      return false;
    }

    // Validate size (should be positive number, reasonable range)
    if (typeof size !== 'number' || size <= 0 || size > 100) {
      return false;
    }

    // Validate userId and username
    if (typeof userId !== 'string' || userId.length === 0) {
      return false;
    }

    if (typeof username !== 'string' || username.length === 0) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
module.exports = new BoardManager();
