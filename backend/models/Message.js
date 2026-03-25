const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    default: '',
  },
  image: {
    type: String, // URL or base64
    default: null,
  },
  iv: {
    type: String, // Initialization Vector for E2EE
    default: null,
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  seen: {
    type: Boolean,
    default: false,
  },
  pinned: {
    type: Boolean,
    default: false,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  reactions: {
    type: Map,
    of: String,
    default: {},
  },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
