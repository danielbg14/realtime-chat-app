# Real-Time Chat Application

A simple real-time chat application built with **Node.js**, **Express**, and **Socket.IO**.
Users can join rooms and exchange messages instantly using WebSockets.

---

## Overview

This project demonstrates:

* Event-driven server architecture
* Room-based message broadcasting
* In-memory user session management
* Real-time UI updates with WebSockets

It is designed as a lightweight example of real-time communication patterns using Node.js.

---

## Features

* Real-time messaging with WebSockets
* Room-based chat isolation
* Live user list per room
* Typing indicators (debounced)
* Join/leave system notifications
* Responsive frontend (HTML/CSS/Vanilla JS)

---

## Tech Stack

* **Backend:** Node.js + Express
* **Real-Time Layer:** Socket.IO
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **Architecture:** Event-driven

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/danielbg14/realtime-chat-app.git
cd realtime-chat-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
npm start
```

For development:

```bash
npm run dev
```

### 4. Open in browser

```
http://localhost:3000
```

---

## Architecture

### Event Flow

```
Client → Socket.IO → Server → Room Broadcast → Connected Clients (room)
```

### Core Modules

**index.js**

* Express server initialization
* Socket.IO configuration
* Room join logic
* Message broadcasting
* User lifecycle events

**users.js**

* In-memory user storage
* Add/remove user functions
* Retrieve users per room

---

## Socket Events

| Event         | Direction       | Description                              |
| ------------- | --------------- | ---------------------------------------- |
| `joinRoom`    | Client → Server | Join a specific chat room                |
| `chatMessage` | Client → Server | Send a message                           |
| `typing`      | Client → Server | Notify typing activity                   |
| `message`     | Server → Client | Deliver messages or system notifications |
| `roomUsers`   | Server → Client | Update active users list                 |
| `userTyping`  | Server → Client | Display typing indicator                 |

---

## Project Structure

```
.
├── public
│   ├── index.html
│   ├── script.js
│   └── style.css
├── README.md
├── index.js
├── package.json
└── users.js
```

---

## Possible Improvements

* Persist messages with a database (e.g., MongoDB)
* Add authentication (JWT-based sessions)
* Implement private messaging
* Add message editing/deletion
* Deploy with Docker

---

## License

MIT License