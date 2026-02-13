const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const { addUser, removeUser, getUser, getUsersByRoom } = require('./users');
const User = require('./models/User');
const Message = require('./models/Message');
const { verifySocketToken, generateToken } = require('./middleware/auth');
const authRoutes = require('./routes/auth');

// Load environment variables from .env file if available
// For production, set MONGODB_URI as an environment variable
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app';
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
const messagesRoutes = require('./routes/messages');
app.use('/api/messages', messagesRoutes);

/**
 * MongoDB Connection
 * Connects to MongoDB before starting the server
 * Handles connection errors gracefully
 */
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ MongoDB connection error:', error.message);
    console.error('Please ensure MongoDB is running and MONGODB_URI is correctly set.');
    process.exit(1);
  }
}

/**
 * Socket.io connection handling
 */
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  /**
   * Verify JWT token on connection
   * Client should send token in handshake: socket = io({auth: {token: 'jwt_token'}})
   */
  const decodedToken = verifySocketToken(socket);

  if (!decodedToken) {
    console.warn(`⚠️  Socket ${socket.id} disconnected: Invalid token`);
    socket.emit('error', { message: 'Invalid token. Please login again.' });
    socket.disconnect();
    return;
  }

  // Store authenticated user ID on socket for later use
  socket.userId = decodedToken.userId;
  socket.username = decodedToken.username;

  /**
   * Join Room Event
   * - Adds user to in-memory users tracking
   * - Loads last 50 messages from MongoDB
   * - Sends message history to connecting user
   * - Notifies room of new user
   */
  socket.on('joinRoom', async (room) => {
    try {
      console.log(`\n🔌 Join request: userId='${socket.userId}', username='${socket.username}', room='${room}'`);

      if (!room || typeof room !== 'string') {
        socket.emit('error', { message: 'Invalid room name' });
        return;
      }

      // Add user to in-memory tracking (for current session)
      const user = addUser(socket.id, socket.username, room, socket.userId);

      // Join socket to room
      socket.join(room);
      console.log(`  ✓ Socket joined room: '${room}'`);

      // Load last 50 messages from MongoDB for this room
      const previousMessages = await Message.find({ room })
        .sort({ timestamp: -1 })
        .limit(50)
        .exec();

      // Reverse to get chronological order (oldest first)
      const messages = previousMessages.reverse().map((msg) => ({
        id: msg._id,
        username: msg.user ? msg.user.username : 'Unknown',
        content: msg.content,
        timestamp: msg.timestamp ? msg.timestamp.toISOString() : new Date().toISOString(),
        edited: msg.edited,
        deleted: msg.deleted || false,
        deletedAt: msg.deletedAt || null,
      }));

      console.log(`  ✓ Loaded ${messages.length} previous messages from DB`);

      // Send message history to the joining user
      socket.emit('messageHistory', {
        room,
        messages,
        count: messages.length,
      });

      // Welcome current user
      socket.emit('message', {
        username: 'Chat System',
        text: `Welcome to ${room}, ${socket.username}!`,
        timestamp: new Date().toISOString(),
      });

      // Broadcast to room that user joined
      socket.broadcast.to(room).emit('message', {
        username: 'Chat System',
        text: `${socket.username} has joined the chat`,
        timestamp: new Date().toISOString(),
      });

      // Emit updated users list to all in room
      io.to(room).emit('roomUsers', {
        room,
        users: getUsersByRoom(room),
      });

      console.log(`  ✓ Room join completed\n`);
    } catch (error) {
      console.error('❌ Error in joinRoom:', error.message);
      socket.emit('error', {
        message: 'Failed to join room. Please try again.',
      });
    }
  });

  /**
   * Chat Message Event
   * - Saves message to MongoDB using authenticated user ID
   * - Broadcasts to room users
   * - Handles errors gracefully
   */
  socket.on('chatMessage', async (msg) => {
    const user = getUser(socket.id);

    if (!user) {
      console.error('❌ chatMessage: User not found in session');
      socket.emit('error', { message: 'User not found. Please rejoin the room.' });
      return;
    }

    console.log(`\n💬 Message from '${user.username}' in room '${user.room}': "${msg}"`);

    try {
      // Use authenticated user ID from token (more secure than username lookup)
      console.log(`  ✓ Using authenticated user ID: ${socket.userId}`);

      // Create and save message to MongoDB
      const newMessage = new Message({
        user: socket.userId, // Use verified user ID from JWT token
        room: user.room,
        content: msg,
        timestamp: new Date(),
        edited: false,
        private: false,
      });

      const savedMessage = await newMessage.save();
      console.log(`  ✓ Message saved to DB with ID: ${savedMessage._id}`);

      // Emit message to room
      io.to(user.room).emit('message', {
        id: savedMessage._id,
        username: user.username,
        text: msg,
        timestamp: savedMessage.timestamp ? savedMessage.timestamp.toISOString() : new Date().toISOString(),
        edited: false,
      });

      console.log(`  ✓ Message broadcast to room '${user.room}'\n`);
    } catch (error) {
      console.error('❌ Error saving message:', error.message);
      console.error('Stack:', error.stack);
      socket.emit('error', {
        message: 'Failed to send message. Please try again.',
      });
    }
  });

  /**
   * Typing Indicator Event
   * - Broadcasts to other users in room that this user is typing
   * - No database persistence needed
   */
  socket.on('typing', () => {
    const user = getUser(socket.id);

    if (user) {
      socket.broadcast.to(user.room).emit('userTyping', {
        username: user.username,
      });
    }
  });

  /**
   * Disconnect Event
   * - Removes user from tracking
   * - Notifies room that user left
   * - Broadcasts updated user list
   */
  socket.on('disconnect', () => {
    const user = removeUser(socket.id);

    if (user) {
      console.log(`Client disconnected: ${socket.id}`);

      io.to(user.room).emit('message', {
        username: 'Chat System',
        text: `${user.username} has left the chat`,
        timestamp: new Date().toISOString(),
      });

      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getUsersByRoom(user.room),
      });
    }
  });

  /**
   * Edit Message
   * Payload: { id, content }
   */
  socket.on('editMessage', async ({ id, content }, ack) => {
    try {
      const user = getUser(socket.id);
      if (!user) {
        socket.emit('error', { message: 'User not in session' });
        return;
      }

      const message = await Message.findById(id);
      if (!message) {
        if (typeof ack === 'function') ack({ success: false, message: 'Message not found' });
        return;
      }

      // message.user may be populated (object with username) or an ObjectId/string
      const messageUserId = message.user && message.user._id ? String(message.user._id) : String(message.user);
      if (messageUserId !== String(socket.userId)) {
        console.warn('Unauthorized edit attempt:', { messageUserId, socketUserId: socket.userId });
        if (typeof ack === 'function') ack({ success: false, message: 'Not authorized to edit this message' });
        return;
      }

      if (message.deleted) {
        if (typeof ack === 'function') ack({ success: false, message: 'Cannot edit a deleted message' });
        return;
      }

      // Enforce edit window
      const editWindowMinutes = parseInt(process.env.EDIT_WINDOW_MINUTES || '15', 10);
      const now = Date.now();
      const sentAt = new Date(message.timestamp).getTime();
      const allowed = now - sentAt <= editWindowMinutes * 60 * 1000;

      if (!allowed) {
        if (typeof ack === 'function') ack({ success: false, message: 'Edit window has expired' });
        return;
      }

      message.content = content;
      message.edited = true;
      message.editedAt = new Date();
      await message.save();

      // Notify room that message was edited
      io.to(user.room).emit('messageEdited', {
        id: message._id,
        content: message.content,
        edited: true,
        editedAt: message.editedAt,
      });

      if (typeof ack === 'function') ack({ success: true, message: 'Message edited', data: { id: message._id, content: message.content } });
    } catch (error) {
      console.error('❌ editMessage error:', error.message);
      if (typeof ack === 'function') ack({ success: false, message: 'Failed to edit message' });
    }
  });

  /**
   * Delete Message (soft delete)
   * Payload: { id }
   */
  socket.on('deleteMessage', async ({ id }, ack) => {
    try {
      const user = getUser(socket.id);
      if (!user) {
        socket.emit('error', { message: 'User not in session' });
        return;
      }

      const message = await Message.findById(id);
      if (!message) {
        if (typeof ack === 'function') ack({ success: false, message: 'Message not found' });
        return;
      }

      // message.user may be populated (object with username) or an ObjectId/string
      const msgUserId = message.user && message.user._id ? String(message.user._id) : String(message.user);
      if (msgUserId !== String(socket.userId)) {
        console.warn('Unauthorized delete attempt:', { msgUserId, socketUserId: socket.userId });
        if (typeof ack === 'function') ack({ success: false, message: 'Not authorized to delete this message' });
        return;
      }

      // Soft delete
      message.deleted = true;
      message.deletedAt = new Date();
      await message.save();

      // Notify room that message was deleted
      io.to(user.room).emit('messageDeleted', {
        id: message._id,
        deletedAt: message.deletedAt,
      });

      if (typeof ack === 'function') ack({ success: true, message: 'Message deleted', data: { id: message._id } });
    } catch (error) {
      console.error('❌ deleteMessage error:', error.message);
      if (typeof ack === 'function') ack({ success: false, message: 'Failed to delete message' });
    }
  });

  /**
   * Handle socket errors
   */
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

/**
 * Start Server
 * Connects to MongoDB first, then starts listening for connections
 */
async function startServer() {
  await connectDatabase();

  server.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📍 Visit http://localhost:${PORT} in your browser`);
    console.log(`📦 MongoDB connected to: ${MONGODB_URI}\n`);
  });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down gracefully...');
  await mongoose.connection.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
startServer();
