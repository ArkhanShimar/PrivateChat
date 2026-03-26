const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Helper: sign JWT and set HTTP-only cookie
const sendToken = (res, user) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return token;
};

// GET /api/auth/status — check if registration is open (< 2 users)
router.get('/status', async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ canRegister: count < 2, userCount: count });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count >= 2) {
      return res.status(403).json({ message: 'Registration closed. Only 2 users allowed.' });
    }

    const { name, password, pin, publicKey, encryptedPrivateKey, encryptedPrivateKeyPin } = req.body;
    
    if (!name || !password || !pin) {
      return res.status(400).json({ message: 'Name, password, and PIN are required' });
    }
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 6 digits' });
    }

    const user = await User.create({ name, password, pin, publicKey, encryptedPrivateKey, encryptedPrivateKeyPin });
    const token = sendToken(res, user);

    res.status(201).json({ user: user.toJSON(), token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login — login with password only
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const users = await User.find({});
    let matchedUser = null;
    for (const u of users) {
      if (await u.comparePassword(password)) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    const token = sendToken(res, matchedUser);
    res.json({ user: matchedUser.toJSON(), token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/pin-login — quick login with PIN only
router.post('/pin-login', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ message: 'PIN is required' });
    }

    const users = await User.find({});
    let matchedUser = null;
    for (const u of users) {
      if (await u.comparePin(pin)) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ message: 'Invalid PIN' });
    }

    const token = sendToken(res, matchedUser);
    res.json({ user: matchedUser.toJSON(), token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me — get current user
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user.toJSON() });
});

// GET /api/auth/users — get list of user names (for PIN login selector)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name _id');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/update — change name, password, or PIN
router.patch('/update', protect, async (req, res) => {
  try {
    const { name, currentPassword, newPassword, currentPin, newPin } = req.body;
    const user = await User.findById(req.user._id);

    if (name) {
      user.name = name.trim();
    }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
      const valid = await user.comparePassword(currentPassword);
      if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });
      user.password = newPassword;
    }

    if (newPin) {
      if (!/^\d{6}$/.test(newPin)) return res.status(400).json({ message: 'PIN must be exactly 6 digits' });
      if (!currentPin) return res.status(400).json({ message: 'Current PIN required' });
      const valid = await user.comparePin(currentPin);
      if (!valid) return res.status(401).json({ message: 'Current PIN is incorrect' });
      user.pin = newPin;
    }

    await user.save();
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/auth/update-profile — generic profile update for E2EE keys
router.put('/update-profile', protect, async (req, res) => {
  try {
    const { publicKey, encryptedPrivateKey, encryptedPrivateKeyPin } = req.body;
    const user = await User.findById(req.user._id);

    if (publicKey) user.publicKey = publicKey;
    if (encryptedPrivateKey) user.encryptedPrivateKey = encryptedPrivateKey;
    if (encryptedPrivateKeyPin) user.encryptedPrivateKeyPin = encryptedPrivateKeyPin;

    await user.save();
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/auth/account — delete own account
router.delete('/account', protect, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password required to delete account' });

    const user = await User.findById(req.user._id);
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: 'Incorrect password' });

    await User.findByIdAndDelete(req.user._id);
    res.clearCookie('token');
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/avatar/:userId — set avatar for any user (anyone can update anyone's DP)
router.patch('/avatar/:userId', protect, async (req, res) => {
  try {
    const { avatar } = req.body; // base64 or URL
    if (!avatar) return res.status(400).json({ message: 'Avatar required' });

    // Upload to Cloudinary if configured
    let avatarUrl = avatar;
    try {
      const { uploadImage } = require('../config/cloudinary');
      avatarUrl = await uploadImage(avatar);
    } catch (e) {
      // fallback: store as-is (base64)
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { avatar: avatarUrl },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/nickname/:targetId — set a nickname for another user
router.patch('/nickname/:targetId', protect, async (req, res) => {
  try {
    const { nickname } = req.body;
    const me = await User.findById(req.user._id);
    if (nickname) {
      me.nicknames.set(req.params.targetId, nickname.trim());
    } else {
      me.nicknames.delete(req.params.targetId);
    }
    await me.save();
    res.json({ user: me.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/full-users — get users with avatar (for profile display)
router.get('/full-users', protect, async (req, res) => {
  try {
    const users = await User.find({});
    res.json({ users: users.map(u => u.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
