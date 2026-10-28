const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    clientId: String,
    name: String,
    speakingMs: { type: Number, default: 0 },
    turns: { type: Number, default: 0 },
    interruptions: { type: Number, default: 0 },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  roomId: { type: String, required: true, index: true },
  topic: String,
  prepSec: Number,
  discussionSec: Number,
  startedAt: Date,
  discussionStartedAt: Date,
  endedAt: Date,
  endReason: String, // 'timer' | 'host'
  participants: [participantSchema],
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});

module.exports = mongoose.models.Session || mongoose.model('Session', sessionSchema);
