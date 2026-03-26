const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');
const { uploadImage, uploadAudio } = require('../config/cloudinary');

// Track connected users: userId -> socketId
const connectedUsers = new Map();

/**
 * Authenticate socket connection via JWT token in handshake
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie
      ?.split(';')
      .find(c => c.trim().startsWith('token='))
      ?.split('=')[1];

    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return next(new Error('User not found'));

    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
};

const socketHandler = (io) => {
  // Apply auth middleware to all socket connections
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    connectedUsers.set(userId, socket.id);

    console.log(`💕 ${socket.user.name} connected`);

    // Join the single shared room
    socket.join('lovechat-room');

    // Notify both users of online status
    io.to('lovechat-room').emit('user_online', {
      userId,
      name: socket.user.name,
      onlineUsers: Array.from(connectedUsers.keys()),
    });

    // Handle sending a message
    socket.on('send_message', async (data) => {
      try {
        const { text, image, voice, voiceDuration, replyTo, iv } = data;

        if (!text && !image && !voice) return;

        let imageUrl = null;
        if (image) {
          try {
            imageUrl = await uploadImage(image);
          } catch (uploadErr) {
            console.error('❌ Image upload failed:', uploadErr.message);
            socket.emit('upload_error', { message: 'Image upload failed' });
            return;
          }
        }

        let voiceUrl = null;
        if (voice) {
          try {
            voiceUrl = await uploadAudio(voice);
          } catch (uploadErr) {
            console.error('❌ Voice upload failed:', uploadErr.message);
            socket.emit('upload_error', { message: 'Voice upload failed' });
            return;
          }
        }

        const message = await Message.create({
          senderId: socket.user._id,
          text: text || '',
          image: imageUrl,
          voice: voiceUrl,
          voiceDuration: voiceDuration || 0,
          replyTo: replyTo || null,
          iv: iv || null,
        });

        await message.populate('senderId', 'name');
        if (message.replyTo) {
          await message.populate({
            path: 'replyTo',
            populate: { path: 'senderId', select: 'name' }
          });
        }

        io.to('lovechat-room').emit('new_message', message);
      } catch (err) {
        console.error('❌ send_message error:', err.message);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator
    socket.on('typing', () => {
      socket.to('lovechat-room').emit('user_typing', {
        userId,
        name: socket.user.name,
      });
    });

    socket.on('stop_typing', () => {
      socket.to('lovechat-room').emit('user_stop_typing', { userId });
    });

    // Handle pin/unpin message
    socket.on('pin_message', async ({ messageId }) => {
      try {
        // Unpin any currently pinned message first
        await Message.updateMany({ pinned: true }, { pinned: false });
        const message = await Message.findByIdAndUpdate(
          messageId,
          { pinned: true },
          { new: true }
        ).populate('senderId', 'name');
        io.to('lovechat-room').emit('message_pinned', message);
      } catch (err) {
        console.error('pin_message error:', err);
      }
    });

    socket.on('unpin_message', async () => {
      try {
        await Message.updateMany({ pinned: true }, { pinned: false });
        io.to('lovechat-room').emit('message_unpinned');
      } catch (err) {
        console.error('unpin_message error:', err);
      }
    });

    // Delete a single message for everyone (tombstone)
    socket.on('delete_message', async ({ messageId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;
        
        message.isDeleted = true;
        message.text = '';
        message.image = null;
        message.replyTo = null;
        await message.save();

        io.to('lovechat-room').emit('message_deleted', { messageId });
      } catch (err) {
        console.error('delete_message error:', err);
      }
    });

    // Handle message reactions
    socket.on('react_message', async ({ messageId, emoji }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;
        
        if (!message.reactions) message.reactions = new Map();
        
        // If they click the same emoji they reacted with, we can optionally toggle off,
        // or just set it. We'll set it or reset it if null.
        if (!emoji) {
          message.reactions.delete(userId);
        } else {
          message.reactions.set(userId, emoji);
        }
        
        await message.save();
        
        // Convert Map to plain object for socket payload
        const reactionsObj = Object.fromEntries(message.reactions);
        io.to('lovechat-room').emit('message_reaction', { messageId, reactions: reactionsObj });
      } catch (err) {
        console.error('react_message error:', err);
      }
    });

    // Clear entire chat for everyone
    socket.on('clear_chat', async () => {
      try {
        await Message.deleteMany({});
        io.to('lovechat-room').emit('chat_cleared');
      } catch (err) {
        console.error('clear_chat error:', err);
      }
    });
    // Handle seen receipts
    socket.on('mark_seen', async () => {
      try {
        await Message.updateMany(
          { senderId: { $ne: socket.user._id }, seen: false },
          { seen: true }
        );
        io.to('lovechat-room').emit('messages_seen', { by: userId });
      } catch (err) {
        console.error('mark_seen error:', err);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      connectedUsers.delete(userId);
      console.log(`💔 ${socket.user.name} disconnected`);
      
      const now = new Date();
      try {
        await User.findByIdAndUpdate(userId, { lastSeen: now });
      } catch (err) {
        console.error('Failed to update lastSeen', err);
      }

      io.to('lovechat-room').emit('user_offline', {
        userId,
        onlineUsers: Array.from(connectedUsers.keys()),
        lastSeen: now,
      });
    });

    // ── WebRTC Signaling ─────────────────────────────────

    socket.on('call_user', ({ offer }) => {
      socket.to('lovechat-room').emit('incoming_call', {
        offer,
        from: {
          id: socket.user._id,
          name: socket.user.name,
          avatar: socket.user.avatar,
        }
      });
    });

    socket.on('answer_call', ({ answer }) => {
      socket.to('lovechat-room').emit('call_accepted', { answer });
    });

    socket.on('reject_call', () => {
      socket.to('lovechat-room').emit('call_rejected');
    });

    socket.on('end_call', () => {
      socket.to('lovechat-room').emit('call_ended');
    });

    socket.on('ice_candidate', ({ candidate }) => {
      socket.to('lovechat-room').emit('ice_candidate', { candidate });
    });

    socket.on('typing', () => {
      socket.to('lovechat-room').emit('user_typing', { userId: socket.user._id });
    });

    socket.on('stop_typing', () => {
      socket.to('lovechat-room').emit('user_stop_typing', { userId: socket.user._id });
    });

    socket.on('keys_updated', () => {
      socket.to('lovechat-room').emit('keys_updated');
    });
  });
};

module.exports = { socketHandler };
