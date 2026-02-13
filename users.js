/**
 * User Session Management
 * 
 * This module handles in-memory tracking of connected users and their sessions.
 * For persistent user authentication, see models/User.js which stores users in MongoDB.
 * 
 * TODO: When implementing JWT authentication:
 * 1. Verify the JWT token on socket connection
 * 2. Store the decoded user ID from the token
 * 3. Use that ID to fetch user profile from MongoDB
 * 4. Validate existing user in DB before allowing room access
 */

const users = [];

/**
 * Add a user to the session tracking system
 * Called when a user joins a room via Socket.io
 * 
 * @param {string} socketId - Unique socket connection ID
 * @param {string} username - Display username for the user
 * @param {string} room - Chat room name to join
 * @param {string} userId - MongoDB user ID from JWT token
 * @returns {Object} User object with session info
 */
function addUser(socketId, username, room, userId) {
  const user = {
    id: socketId,
    userId, // MongoDB user ID from JWT token
    username,
    room,
    connectedAt: new Date(),
  };
  
  users.push(user);
  console.log(`User '${username}' added to room '${room}'`);
  
  return user;
}

/**
 * Remove a user from the session tracking system
 * Called when a user disconnects or leaves a room
 * 
 * @param {string} socketId - Unique socket connection ID
 * @returns {Object|undefined} Removed user object or undefined if not found
 */
function removeUser(socketId) {
  const index = users.findIndex((user) => user.id === socketId);
  
  if (index !== -1) {
    const removedUser = users.splice(index, 1)[0];
    console.log(`User '${removedUser.username}' removed from session`);
    return removedUser;
  }
  
  return undefined;
}

/**
 * Get a user by socket ID
 * 
 * @param {string} socketId - Unique socket connection ID
 * @returns {Object|undefined} User object or undefined if not found
 */
function getUser(socketId) {
  return users.find((user) => user.id === socketId);
}

/**
 * Get all users in a specific room
 * 
 * @param {string} room - Chat room name
 * @returns {Array} Array of user objects in the room
 */
function getUsersByRoom(room) {
  return users.filter((user) => user.room === room).map((user) => user.username);
}

/**
 * Get total number of connected users
 * Useful for monitoring and statistics
 * 
 * @returns {number} Total count of connected users
 */
function getUserCount() {
  return users.length;
}

/**
 * Get all connected users
 * 
 * @returns {Array} Array of all connected user objects
 */
function getAllUsers() {
  return [...users];
}

/**
 * Add authenticated user from MongoDB
 * This should be called after verifying a user's credentials with the database
 * 
 * TODO: Update this method when JWT authentication is implemented
 * Should extract user data from verified JWT token
 * 
 * Example usage after auth implementation:
 * const user = await User.findById(decodedToken.userId);
 * addAuthenticatedUser(socketId, user._id, user.username, room);
 * 
 * @param {string} socketId - Unique socket connection ID
 * @param {string} userId - MongoDB User document ID
 * @param {string} username - User's username from DB
 * @param {string} room - Chat room to join
 * @returns {Object} User session object
 */
function addAuthenticatedUser(socketId, userId, username, room) {
  const user = {
    id: socketId,
    userId, // MongoDB User ID - use this for database operations
    username,
    room,
    connectedAt: new Date(),
    authenticated: true,
  };
  
  users.push(user);
  console.log(`Authenticated user '${username}' (${userId}) added to room '${room}'`);
  
  return user;
}

module.exports = {
  addUser,
  removeUser,
  getUser,
  getUsersByRoom,
  getUserCount,
  getAllUsers,
  addAuthenticatedUser,
};
