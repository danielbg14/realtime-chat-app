/**
 * Chat Application - Frontend
 * Handles authentication and real-time chat functionality
 */

// Get JWT token from localStorage
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');

// Redirect to login if no token
if (!token || !username) {
  window.location.href = '/auth.html';
}

// Initialize Socket.IO with JWT token in auth
const socket = io({
  auth: {
    token: token,
  },
});

let currentRoom = null;
let typingTimeout;
let typingIndicatorTimeout;
let isTyping = false;

// DOM Elements
const joinContainer = document.getElementById('joinContainer');
const chatContainer = document.getElementById('chatContainer');
const joinForm = document.getElementById('joinForm');
const roomInput = document.getElementById('room');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const usersList = document.getElementById('usersList');
const typingIndicator = document.getElementById('typingIndicator');
const roomDisplay = document.getElementById('roomDisplay');
const chatTitle = document.getElementById('chatTitle');
const errorMessage = document.getElementById('errorMessage');
const aloneMessage = document.getElementById('aloneMessage');
const roomCode = document.getElementById('roomCode');
const inputContainer = document.querySelector('.input-container');
const userInfo = document.getElementById('userInfo');

// Set current user info
if (userInfo) {
  userInfo.textContent = `👤 ${username}`;
}

/**
 * Logout function
 */
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  socket.disconnect();
  window.location.href = '/auth.html';
}

/**
 * Join room
 */
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const room = roomInput.value.trim();

  if (!room) {
    errorMessage.textContent = '❌ Please enter a room name';
    return;
  }

  currentRoom = room;
  log(`Joining room: ${room}`);

  // Emit joinRoom event with room name only
  // Username comes from JWT token on server
  socket.emit('joinRoom', room);

  joinContainer.style.display = 'none';
  chatContainer.classList.add('active');
  chatTitle.textContent = room;
  roomDisplay.textContent = room;

  // Initialize: disable messaging (alone state)
  messageInput.disabled = true;
  sendBtn.disabled = true;
  inputContainer.classList.add('disabled');
  aloneMessage.style.display = 'block';
  roomCode.textContent = room;

  messageInput.focus();
});

/**
 * Send message
 */
function sendMessage() {
  const msg = messageInput.value.trim();
  if (msg) {
    log('Sending message:', msg);
    socket.emit('chatMessage', msg);
    messageInput.value = '';
    typingIndicator.textContent = '';
    messageInput.focus();
  }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

/**
 * Typing indicator
 */
messageInput.addEventListener('input', () => {
  if (!isTyping) {
    socket.emit('typing');
    isTyping = true;
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
  }, 300);
});

/**
 * Receive message
 */
socket.on('message', (data) => {
  log('Message received:', data);
  typingIndicator.textContent = '';
  clearTimeout(typingIndicatorTimeout);
  const messageEl = createMessageElement({
    id: data.id,
    username: data.username,
    content: data.text,
    timestamp: data.timestamp,
    edited: data.edited || false,
  });

  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

/**
 * Load message history when joining room
 */
socket.on('messageHistory', (data) => {
  log(`Loading ${data.count} messages from history`);
  messagesContainer.innerHTML = '';
  
  data.messages.forEach((msg) => {
    const messageEl = createMessageElement({
      id: msg.id,
      username: msg.username,
      content: msg.content,
      timestamp: msg.timestamp,
      edited: msg.edited || false,
    });
    messagesContainer.appendChild(messageEl);
  });
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

  /**
   * Create a DOM element for a message with optional edit/delete controls
   */
  function createMessageElement(msg) {
    const el = document.createElement('div');
    el.className = msg.username === 'Chat System' ? 'message system' : 'message';
    el.dataset.id = msg.id || '';

    if (msg.username === 'Chat System') {
      el.textContent = msg.content || msg.text || 'System';
      return el;
    }

    // Normal message
    const isOwn = msg.username === username;
    el.innerHTML = `
      <div class="message-username">${msg.username}${msg.edited ? ' <small>(edited)</small>' : ''}</div>
      <div class="message-text">${escapeHtml(msg.content || msg.text || '')}</div>
      <div class="message-time">${formatTimestamp(msg.timestamp)}</div>
    `;

    if (isOwn) {
      const controls = document.createElement('div');
      controls.className = 'message-controls';

      const editBtn = document.createElement('button');
      editBtn.className = 'msg-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => handleEdit(msg));

      const delBtn = document.createElement('button');
      delBtn.className = 'msg-del-btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => handleDelete(msg));

      controls.appendChild(editBtn);
      controls.appendChild(delBtn);
      el.appendChild(controls);
    }

    return el;
  }

  function formatTimestamp(ts) {
    try {
      if (!ts) return '';
      // If ts already looks like a human time (e.g., "12:47:56 AM"), return it
      if (typeof ts === 'string' && /^\d{1,2}:\d{2}/.test(ts)) return ts;

      // Try Date.parse first (handles ISO strings and numbers)
      const parsed = Date.parse(ts);
      if (!isNaN(parsed)) {
        return new Date(parsed).toLocaleTimeString();
      }

      // Fallback: return raw string
      return String(ts);
    } catch (e) {
      return ts || '';
    }
  }

  function escapeHtml(unsafe) {
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function handleEdit(msg) {
    const newContent = prompt('Edit your message:', msg.content || msg.text || '');
    if (newContent == null) return; // cancelled
    const trimmed = newContent.trim();
    if (!trimmed) return alert('Message cannot be empty');

    log('Emitting editMessage', { id: msg.id, content: trimmed });
    socket.emit('editMessage', { id: msg.id, content: trimmed }, (res) => {
      log('editMessage ack:', res);
      if (!res || !res.success) return alert('Edit failed: ' + (res?.message || 'Unknown'));
      // Update UI optimistically (server will also broadcast messageEdited to all clients)
      const el = messagesContainer.querySelector(`[data-id="${msg.id}"]`);
      if (el) {
        const textEl = el.querySelector('.message-text');
        if (textEl) textEl.innerHTML = escapeHtml(trimmed) + ' <small>(edited)</small>';
      }
    });
  }

  function handleDelete(msg) {
    const ok = confirm('Delete this message?');
    if (!ok) return;

    log('Emitting deleteMessage', { id: msg.id });
    socket.emit('deleteMessage', { id: msg.id }, (res) => {
      log('deleteMessage ack:', res);
      if (!res || !res.success) return alert('Delete failed: ' + (res?.message || 'Unknown'));
      // Remove message from DOM
      const el = messagesContainer.querySelector(`[data-id="${msg.id}"]`);
      if (el) el.remove();
    });
  }

  // Update a message in the DOM when edited
  socket.on('messageEdited', ({ id, content, edited, editedAt }) => {
    const el = messagesContainer.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    const textEl = el.querySelector('.message-text');
    if (textEl) textEl.innerHTML = escapeHtml(content) + (edited ? ' <small>(edited)</small>' : '');
  });

  // Remove a message from the DOM when deleted
  socket.on('messageDeleted', ({ id }) => {
    const el = messagesContainer.querySelector(`[data-id="${id}"]`);
    if (el) el.remove();
  });

/**
 * Update users list
 */
socket.on('roomUsers', (data) => {
  usersList.innerHTML = '';
  data.users.forEach((username) => {
    const li = document.createElement('li');
    li.textContent = typeof username === 'string' ? username : username.username;
    usersList.appendChild(li);
  });

  // Enable/disable messaging based on number of users
  if (data.users.length > 1) {
    messageInput.disabled = false;
    sendBtn.disabled = false;
    inputContainer.classList.remove('disabled');
    aloneMessage.style.display = 'none';
  } else {
    messageInput.disabled = true;
    sendBtn.disabled = true;
    inputContainer.classList.add('disabled');
    aloneMessage.style.display = 'block';
  }
});

/**
 * Typing indicator
 */
socket.on('userTyping', (data) => {
  if (data.username !== username) {
    typingIndicator.textContent = `${data.username} is typing...`;

    clearTimeout(typingIndicatorTimeout);
    typingIndicatorTimeout = setTimeout(() => {
      typingIndicator.textContent = '';
    }, 3000);
  }
});

/**
 * Error handling
 */
socket.on('error', (error) => {
  error('Socket error:', error);
  if (error.message) {
    errorMessage.textContent = '❌ ' + error.message;
  }
});

/**
 * Connection events for debugging
 */
socket.on('connect', () => {
  log('Connected to server');
});

socket.on('disconnect', () => {
  log('Disconnected from server');
});

socket.on('connect_error', (error) => {
  error('Connection error:', error.message);
  errorMessage.textContent = '❌ Connection failed: ' + error.message;
});
/**
 * ==========================================
 * WHITEBOARD FUNCTIONALITY
 * ==========================================
 */

let whiteboard = null;

// Tab switching functionality
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');

    // Remove active class from all buttons
    tabButtons.forEach((b) => b.classList.remove('active'));
    // Add active class to clicked button
    btn.classList.add('active');

    // Hide all tab contents
    tabContents.forEach((content) => {
      content.style.display = 'none';
    });

    // Show selected tab content
    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) {
      selectedTab.style.display = 'flex';

      // If switching to whiteboard, trigger canvas resize
      if (tabName === 'whiteboard' && whiteboard) {
        // Use multiple retries to ensure layout is calculated
        const tryResize = (attempt = 0) => {
          whiteboard.initCanvasSize();
          log(`Canvas resize attempt ${attempt + 1}: ${whiteboard.canvas.width} x ${whiteboard.canvas.height}`);
          
          // If width is still 0, retry with increased delay
          if (whiteboard.canvas.width === 0 && attempt < 5) {
            setTimeout(() => tryResize(attempt + 1), 100 * (attempt + 1));
          }
        };

        // First try on next animation frame
        requestAnimationFrame(() => {
          setTimeout(tryResize, 50);
        });
      }
    }
  });
});

/**
 * Initialize whiteboard when user joins room
 */
function initializeWhiteboard() {
  if (whiteboard) {
    return; // Already initialized
  }

  try {
    whiteboard = new Whiteboard('whiteboard', socket, {
      defaultColor: '#000000',
      defaultBrushSize: 3,
    });

    // Set the room for the whiteboard
    whiteboard.setRoom(currentRoom);

    // Initial canvas sizing (might be re-done when tab is clicked)
    setTimeout(() => {
      whiteboard.initCanvasSize();
    }, 200);

    // Color picker
    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) {
      colorPicker.addEventListener('change', (e) => {
        whiteboard.setColor(e.target.value);
      });
    }

    // Brush size slider
    const brushSize = document.getElementById('brushSize');
    const brushSizeValue = document.getElementById('brushSizeValue');

    if (brushSize && brushSizeValue) {
      brushSize.addEventListener('input', (e) => {
        const size = e.target.value;
        brushSizeValue.textContent = size;
        whiteboard.setBrushSize(size);
      });
    }

    // Clear board button
    const clearBoardBtn = document.getElementById('clearBoardBtn');
    if (clearBoardBtn) {
      clearBoardBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the whiteboard?\nThis will erase the board for everyone in this room.')) {
          whiteboard.clearBoard();
        }
      });
    }

    // Undo button
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        whiteboard.undoStroke();
      });
    }

    log('Whiteboard initialized');
  } catch (error) {
    error('Failed to initialize whiteboard:', error);
  }
}

/**
 * Modify joinRoom to initialize whiteboard
 */
const originalJoinFormSubmit = joinForm.addEventListener.toString();

// We need to initialize whiteboard after the server responds
socket.on('messageHistory', () => {
  // Delay initialization slightly to ensure DOM is ready
  setTimeout(initializeWhiteboard, 100);
});