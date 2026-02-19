/**
 * Collaborative Whiteboard Frontend
 * Handles Canvas drawing with real-time Socket.IO sync
 */

class Whiteboard {
  constructor(canvasId, socket, options = {}) {
    this.canvas = document.getElementById(canvasId);
    
    if (!this.canvas) {
      error(`❌ Canvas element with id '${canvasId}' not found`);
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.socket = socket;
    this.currentRoom = null;
    
    // Drawing state
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.currentColor = options.defaultColor || '#000000';
    this.brushSize = options.defaultBrushSize || 3;
    
    // Performance optimization - throttle drawing events
    // Set to 0 for immediate events (no throttle) - bandwidth is minimal with coordinates only
    this.drawEventThrottle = 0;
    this.lastDrawEventTime = 0;
    
    // Stroke grouping - group all segments from mouse down to mouse up
    this.currentStrokeId = null;
    
    // Remote drawing queue for smooth rendering
    this.remoteDrawQueue = [];
    
    // Initialize
    this.initCanvasSize();
    this.setupEventListeners();
    this.setupSocketListeners();
    
    log('✓ Whiteboard initialized');
  }

  /**
   * Initialize canvas with proper DPI scaling
   */
  initCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    
    // Get parent container for reference
    const parent = this.canvas.parentElement;
    if (!parent) {
      error('Canvas parent not found');
      return;
    }

    // Force layout calculation
    let width = parent.clientWidth;
    let height = parent.clientHeight;

    // If parent has no size, try grandparent or window
    if (width === 0 || height === 0) {
      const grandparent = parent.parentElement;
      if (grandparent) {
        width = grandparent.clientWidth;
        height = grandparent.clientHeight;
      }
    }

    // Fallback: use bounding rect
    if (width === 0) {
      const rect = this.canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }

    // Ensure minimum size
    if (width === 0) width = 500;
    if (height === 0) height = 400;

    log(`Canvas sizing: ${width}x${height} (DPR: ${dpr})`);
    
    // Set true size in memory (scaled to account for device pixel ratio)
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    
    // Scale context to match device pixel ratio
    this.ctx.scale(dpr, dpr);
    
    // Set display size (CSS pixels)
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }

  /**
   * Setup canvas event listeners for drawing
   */
  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
    
    // Touch events for mobile
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    
    // Window resize
    window.addEventListener('resize', () => this.initCanvasSize());
  }

  /**
   * Setup Socket.IO event listeners
   */
  setupSocketListeners() {
    // Load initial board state
    this.socket.on('loadBoard', (data) => {
      log(`📂 Loading board with ${data.strokes.length} strokes`);
      this.renderBoard(data.strokes);
    });
    
    // Receive draw events from other users
    this.socket.on('draw', (strokeData) => {
      // Draw the line with smooth interpolation
      const x0 = strokeData.x0;
      const y0 = strokeData.y0;
      const x1 = strokeData.x1;
      const y1 = strokeData.y1;
      const color = strokeData.color;
      const size = strokeData.size;
      
      // Always draw the segment
      this.drawLine(x0, y0, x1, y1, color, size);
    });
    
    // Board cleared by another user
    this.socket.on('boardCleared', () => {
      log('🧹 Board cleared by user');
      this.clearCanvas();
    });
    
    // Stroke undone
    this.socket.on('strokeUndone', (data) => {
      log('↩️  Stroke undone, reloading board with', data.strokes?.length, 'strokes');
      log('📋 Strokes data:', data.strokes);
      this.renderBoard(data.strokes);
    });
    
    // Handle connection/disconnection
    this.socket.on('connect', () => {
      if (this.currentRoom) {
        log('📡 Reconnected - requesting board state');
        this.socket.emit('requestBoardState', { room: this.currentRoom });
      }
    });
  }

  /**
   * Set the current room (called after user joins room)
   */
  setRoom(room) {
    this.currentRoom = room;
    log(`🎨 Whiteboard room set to: ${room}`);
    
    // Request current board state
    this.socket.emit('requestBoardState', { room });
  }

  /**
   * Mouse down - start drawing
   */
  handleMouseDown(e) {
    this.isDrawing = true;
    // Generate unique stroke ID for this continuous drawing session
    this.currentStrokeId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const [x, y] = this.getCanvasCoordinates(e.clientX, e.clientY);
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Mouse move - draw line
   */
  handleMouseMove(e) {
    if (!this.isDrawing) return;
    
    const [x, y] = this.getCanvasCoordinates(e.clientX, e.clientY);
    
    // Local drawing (immediate feedback)
    this.drawLine(this.lastX, this.lastY, x, y, this.currentColor, this.brushSize);
    
    // Emit draw event (no throttle for maximum smoothness)
    this.socket.emit('draw', {
      room: this.currentRoom,
      strokeId: this.currentStrokeId,
      x0: this.lastX,
      y0: this.lastY,
      x1: x,
      y1: y,
      color: this.currentColor,
      size: this.brushSize,
    });
    
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Mouse up - stop drawing
   */
  handleMouseUp(e) {
    if (this.isDrawing) {
      // Emit final stroke segment to ensure no gaps
      const [x, y] = this.getCanvasCoordinates(e.clientX, e.clientY);
      this.socket.emit('draw', {
        room: this.currentRoom,
        strokeId: this.currentStrokeId,
        x0: this.lastX,
        y0: this.lastY,
        x1: x,
        y1: y,
        color: this.currentColor,
        size: this.brushSize,
      });
      // Signal that this stroke is complete
      this.socket.emit('strokeComplete', {
        room: this.currentRoom,
        strokeId: this.currentStrokeId,
      });
      this.lastDrawEventTime = performance.now();
    }
    this.isDrawing = false;
    this.currentStrokeId = null;
  }

  /**
   * Mouse leave canvas - stop drawing
   */
  handleMouseLeave(e) {
    this.isDrawing = false;
  }

  /**
   * Touch start - start drawing via touch
   */
  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.isDrawing = true;
    const [x, y] = this.getCanvasCoordinates(touch.clientX, touch.clientY);
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Touch move - draw line via touch
   */
  handleTouchMove(e) {
    if (!this.isDrawing) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const [x, y] = this.getCanvasCoordinates(touch.clientX, touch.clientY);
    
    // Local drawing
    this.drawLine(this.lastX, this.lastY, x, y, this.currentColor, this.brushSize);
    
    // Emit draw event (no throttle for maximum smoothness)
    this.socket.emit('draw', {
      room: this.currentRoom,
      x0: this.lastX,
      y0: this.lastY,
      x1: x,
      y1: y,
      color: this.currentColor,
      size: this.brushSize,
    });
    
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Touch end - stop drawing
   */
  handleTouchEnd(e) {
    if (this.isDrawing) {
      // Emit final stroke segment to ensure no gaps
      if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const [x, y] = this.getCanvasCoordinates(touch.clientX, touch.clientY);
        this.socket.emit('draw', {
          room: this.currentRoom,
          x0: this.lastX,
          y0: this.lastY,
          x1: x,
          y1: y,
          color: this.currentColor,
          size: this.brushSize,
        });
        this.lastDrawEventTime = performance.now();
      }
    }
    this.isDrawing = false;
    e.preventDefault();
  }

  /**
   * Convert client coordinates to canvas coordinates
   * Uses actual bounding rect (displayed size), not internal canvas resolution
   */
  getCanvasCoordinates(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    
    // Calculate as percentage of displayed canvas size
    const percentX = (clientX - rect.left) / rect.width;
    const percentY = (clientY - rect.top) / rect.height;
    
    // Map to actual canvas resolution
    const x = percentX * this.canvas.width;
    const y = percentY * this.canvas.height;
    
    return [x, y];
  }

  /**
   * Draw a line on canvas
   * @param {number} x0 - Start X coordinate
   * @param {number} y0 - Start Y coordinate
   * @param {number} x1 - End X coordinate
   * @param {number} y1 - End Y coordinate
   * @param {string} color - Line color (hex or rgb)
   * @param {number} size - Brush size
   */
  drawLine(x0, y0, x1, y1, color, size) {
    try {
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = size;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      this.ctx.beginPath();
      this.ctx.moveTo(x0, y0);
      this.ctx.lineTo(x1, y1);
      this.ctx.stroke();
    } catch (error) {
      error('Error drawing line:', error);
    }
  }

  /**
   * Clear the entire canvas
   */
  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render all strokes from board state
   * Used when joining room or on board sync
   * @param {Array} strokes - Array of stroke objects
   */
  renderBoard(strokes) {
    // Clear canvas first
    this.clearCanvas();
    
    // Replay all strokes in order
    if (Array.isArray(strokes) && strokes.length > 0) {
      strokes.forEach(stroke => {
        try {
          this.drawLine(
            stroke.x0,
            stroke.y0,
            stroke.x1,
            stroke.y1,
            stroke.color,
            stroke.size
          );
        } catch (error) {
          error('❌ Error rendering stroke:', error);
        }
      });
    }
  }

  /**
   * Emit clear board event (all users in room)
   */
  clearBoard() {
    this.socket.emit('clearBoard', { room: this.currentRoom });
    this.clearCanvas();
  }

  /**
   * Emit undo stroke event (optional)
   */
  undoStroke() {
    this.socket.emit('undoStroke', { room: this.currentRoom });
  }

  /**
   * Set brush color
   */
  setColor(color) {
    if (typeof color !== 'string' || color.length === 0) {
      warn('Invalid color value');
      return;
    }
    this.currentColor = color;
    log(`🎨 Brush color: ${color}`);
  }

  /**
   * Set brush size
   */
  setBrushSize(size) {
    const numSize = parseInt(size, 10);
    if (isNaN(numSize) || numSize <= 0 || numSize > 100) {
      warn('Invalid brush size (must be 1-100)');
      return;
    }
    this.brushSize = numSize;
    log(`🖌️  Brush size: ${numSize}px`);
  }

  /**
   * Get current brush color
   */
  getColor() {
    return this.currentColor;
  }

  /**
   * Get current brush size
   */
  getBrushSize() {
    return this.brushSize;
  }
}

// Export for use in chat
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Whiteboard;
}
