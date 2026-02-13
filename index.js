const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const path = require('path');
const { addUser, removeUser, getUser, getUsersByRoom } = require('./users');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io connection handling
io.on('connection', (socket) => {
  socket.on('joinRoom', ({ username, room }) => {
    // Add user to users array
    const user = addUser(socket.id, username, room);

    // Join socket to room
    socket.join(room);

    // Welcome current user
    socket.emit('message', {
      username: 'Chat System',
      text: `Welcome to ${room}, ${username}!`,
      timestamp: new Date().toLocaleTimeString(),
    });

    // Broadcast to room that user joined
    socket.broadcast.to(room).emit('message', {
      username: 'Chat System',
      text: `${username} has joined the chat`,
      timestamp: new Date().toLocaleTimeString(),
    });

    // Emit users list to all in room
    io.to(room).emit('roomUsers', {
      room,
      users: getUsersByRoom(room),
    });
  });

  // Listen for chatMessage
  socket.on('chatMessage', (msg) => {
    const user = getUser(socket.id);

    if (user) {
      io.to(user.room).emit('message', {
        username: user.username,
        text: msg,
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  });

  // Listen for typing indicator
  socket.on('typing', () => {
    const user = getUser(socket.id);

    if (user) {
      socket.broadcast.to(user.room).emit('userTyping', {
        username: user.username,
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = removeUser(socket.id);

    if (user) {
      io.to(user.room).emit('message', {
        username: 'Chat System',
        text: `${user.username} has left the chat`,
        timestamp: new Date().toLocaleTimeString(),
      });

      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getUsersByRoom(user.room),
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} in your browser`);
});
