const express = require('express');
const Message = require('../models/Message');
const { verifyToken } = require('../middleware/auth');
const { error: debugError } = require('../debug');

const router = express.Router();

// Edit a message (PUT /api/messages/:id)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    if (message.deleted) return res.status(400).json({ success: false, message: 'Cannot edit a deleted message' });

    // Only owner can edit, and only within allowed edit window
    if (String(message.user) !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this message' });
    }

    const editWindowMinutes = parseInt(process.env.EDIT_WINDOW_MINUTES || '15', 10);
    const now = Date.now();
    const sentAt = new Date(message.timestamp).getTime();
    const allowed = now - sentAt <= editWindowMinutes * 60 * 1000;

    if (!allowed) return res.status(403).json({ success: false, message: 'Edit window has expired' });

    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    return res.json({ success: true, message: 'Message edited', data: {
      id: message._id,
      content: message.content,
      edited: message.edited,
      editedAt: message.editedAt,
    }});
  } catch (error) {
    debugError('Edit message error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to edit message' });
  }
});

// Delete a message (soft delete) (DELETE /api/messages/:id)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    // Only owner can delete
    if (String(message.user) !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this message' });
    }

    // Hard delete - remove from database
    await Message.findByIdAndDelete(id);

    return res.json({ success: true, message: 'Message deleted', data: { id: id } });
  } catch (error) {
    debugError('Delete message error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete message' });
  }
});

module.exports = router;
