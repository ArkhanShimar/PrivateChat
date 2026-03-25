const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  pin: { type: String, required: true },
  // Base64 or Cloudinary URL avatar — anyone can update anyone's avatar
  avatar: { type: String, default: null },
  // Nickname set BY this user FOR the other user
  // e.g. { "otherId": "My Love" }
  nicknames: { type: Map, of: String, default: {} },
  lastSeen: { type: Date, default: null },
  // E2EE Credentials
  publicKey: { type: String, default: null },
  encryptedPrivateKey: { type: String, default: null },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
  if (this.isModified('pin')) this.pin = await bcrypt.hash(this.pin, 12);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};
userSchema.methods.comparePin = function (plain) {
  return bcrypt.compare(plain, this.pin);
};
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.pin;
  // Convert Map to plain object so it serializes correctly over JSON
  if (obj.nicknames instanceof Map) {
    const plain = {};
    obj.nicknames.forEach((val, key) => { plain[key.toString()] = val; });
    obj.nicknames = plain;
  } else if (obj.nicknames && typeof obj.nicknames === 'object') {
    // Already a plain object from toObject() — ensure keys are strings
    const plain = {};
    Object.entries(obj.nicknames).forEach(([k, v]) => { plain[k.toString()] = v; });
    obj.nicknames = plain;
  }
  return obj;
};

module.exports = mongoose.model('User', userSchema);
