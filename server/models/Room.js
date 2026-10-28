const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  passkey: { type: String, required: true, unique: true, trim: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 3 }, // TTL: rooms expire after 3 days
});

module.exports = mongoose.models.Room || mongoose.model('Room', roomSchema);
