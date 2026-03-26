const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');
const { uploadImage } = require('../config/cloudinary');

// GET /api/messages/pinned — get currently pinned message
router.get('/pinned', protect, async (req, res) => {
  try {
    const message = await Message.findOne({ pinned: true })
      .populate('senderId', 'name')
      .populate('replyTo');
    res.json({ message: message || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages/search — search messages by text
router.get('/search', protect, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ messages: [] });
    // Search text (case insensitive)
    const messages = await Message.find({
      text: { $regex: q, $options: 'i' }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('senderId', 'name')
      .populate('replyTo');
      
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages — fetch all messages (paginated)
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'name')
      .populate('replyTo');

    // Return in chronological order
    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/messages — send a message (REST fallback; primary is socket)
router.post('/', protect, async (req, res) => {
  try {
    const { text, image, replyTo } = req.body;

    if (!text && !image) {
      return res.status(400).json({ message: 'Message must have text or image' });
    }

    let imageUrl = null;
    if (image) {
      imageUrl = await uploadImage(image);
    }

    const message = await Message.create({
      senderId: req.user._id,
      text: text || '',
      image: imageUrl,
      replyTo: replyTo || null,
    });

    await message.populate('senderId', 'name');
    if (message.replyTo) await message.populate('replyTo');

    res.status(201).json({ message });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/messages/:id/seen — mark messages as seen
router.patch('/seen', protect, async (req, res) => {
  try {
    // Mark all messages NOT sent by current user as seen
    await Message.updateMany(
      { senderId: { $ne: req.user._id }, seen: false },
      { seen: true }
    );
    res.json({ message: 'Marked as seen' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages/media/:userId — get all images sent by a specific user
router.get('/media/:userId', protect, async (req, res) => {
  try {
    const messages = await Message.find({
      image: { $ne: null },
    }).sort({ createdAt: -1 }).select('image createdAt');
    res.json({ media: messages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
