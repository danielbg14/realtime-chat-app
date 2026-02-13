const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required for a message'],
  },
  room: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [5000, 'Message cannot exceed 5000 characters'],
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  edited: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
    default: null,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  private: {
    type: Boolean,
    default: false,
  },
  recipients: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
});

/**
 * Create a compound index for efficient message retrieval by room and timestamp
 * This speeds up queries like finding messages in a room before a certain time
 */
messageSchema.index({ room: 1, timestamp: -1 });

/**
 * Populate user information when retrieving messages
 * This automatically includes user details without needing separate queries
 */
messageSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    // include _id so server-side ownership checks can compare IDs
    select: 'username _id',
  }).populate({
    path: 'recipients',
    select: 'username _id',
  });

  next();
});

module.exports = mongoose.model('Message', messageSchema);
