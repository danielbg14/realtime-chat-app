const socket = io();
let currentUser = null;
let currentRoom = null;
let typingTimeout;
let typingIndicatorTimeout;
let isTyping = false;

// DOM Elements
const joinContainer = document.getElementById("joinContainer");
const chatContainer = document.getElementById("chatContainer");
const joinForm = document.getElementById("joinForm");
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const messagesContainer = document.getElementById("messagesContainer");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const usersList = document.getElementById("usersList");
const typingIndicator = document.getElementById("typingIndicator");
const roomDisplay = document.getElementById("roomDisplay");
const chatTitle = document.getElementById("chatTitle");
const errorMessage = document.getElementById("errorMessage");
const aloneMessage = document.getElementById("aloneMessage");
const roomCode = document.getElementById("roomCode");
const inputContainer = document.querySelector(".input-container");

// Join room
joinForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const username = usernameInput.value.trim();
  const room = roomInput.value.trim();

  if (!username || !room) {
    errorMessage.textContent = "Please enter username and room";
    return;
  }

  currentUser = username;
  currentRoom = room;

  socket.emit("joinRoom", { username, room });

  joinContainer.style.display = "none";
  chatContainer.classList.add("active");
  chatTitle.textContent = room;
  roomDisplay.textContent = room;

  // Initialize: disable messaging (alone state)
  messageInput.disabled = true;
  sendBtn.disabled = true;
  inputContainer.classList.add("disabled");
  aloneMessage.style.display = "block";
  roomCode.textContent = room;

  messageInput.focus();
});

// Send message
function sendMessage() {
  const msg = messageInput.value.trim();
  if (msg) {
    console.log("📤 Sending message:", msg);
    socket.emit("chatMessage", msg);
    messageInput.value = "";
    typingIndicator.textContent = "";
    messageInput.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Typing indicator
messageInput.addEventListener("input", () => {
  // Debounce typing - only send once every 300ms
  if (!isTyping) {
    socket.emit("typing");
    isTyping = true;
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
  }, 300);
});

// Receive message
socket.on("message", (data) => {
  console.log("📩 Message received:", data);
  // Clear typing indicator when message arrives
  typingIndicator.textContent = "";
  clearTimeout(typingIndicatorTimeout);

  const messageEl = document.createElement("div");

  if (data.username === "Chat System") {
    messageEl.className = "message system";
    messageEl.textContent = data.text;
  } else {
    messageEl.className = "message";
    messageEl.innerHTML = `
            <div class="message-username">${data.username}</div>
            <div class="message-text">${data.text}</div>
            <div class="message-time">${data.timestamp}</div>
          `;
  }

  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Load message history when joining room
socket.on("messageHistory", (data) => {
  console.log(`📚 Loading ${data.count} messages from history`);
  messagesContainer.innerHTML = "";
  
  data.messages.forEach((msg) => {
    const messageEl = document.createElement("div");
    messageEl.className = "message";
    messageEl.innerHTML = `
      <div class="message-username">${msg.username}</div>
      <div class="message-text">${msg.content}</div>
      <div class="message-time">${msg.timestamp}</div>
    `;
    messagesContainer.appendChild(messageEl);
  });
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Update users list
socket.on("roomUsers", (data) => {
  usersList.innerHTML = "";
  data.users.forEach((username) => {
    const li = document.createElement("li");
    li.textContent = typeof username === 'string' ? username : username.username;
    usersList.appendChild(li);
  });

  // Enable/disable messaging based on number of users
  if (data.users.length > 1) {
    // More than 1 user - enable messaging
    messageInput.disabled = false;
    sendBtn.disabled = false;
    inputContainer.classList.remove("disabled");
    aloneMessage.style.display = "none";
  } else {
    // Only 1 user (alone) - disable messaging
    messageInput.disabled = true;
    sendBtn.disabled = true;
    inputContainer.classList.add("disabled");
    aloneMessage.style.display = "block";
  }
});

// Typing indicator
socket.on("userTyping", (data) => {
  if (data.username !== currentUser) {
    typingIndicator.textContent = `${data.username} is typing...`;

    // Clear typing indicator after 3 seconds of no new typing events
    clearTimeout(typingIndicatorTimeout);
    typingIndicatorTimeout = setTimeout(() => {
      typingIndicator.textContent = "";
    }, 3000);
  }
});

// Error handling
socket.on("error", (error) => {
  console.error("❌ Socket error:", error);
  errorMessage.textContent = error.message || "An error occurred";
});

// Connection events for debugging
socket.on("connect", () => {
  console.log("✓ Connected to server");
});

socket.on("disconnect", () => {
  console.log("✗ Disconnected from server");
});