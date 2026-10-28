const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  clientId: { type: String, required: true },
  roomId: String,
  userName: String,
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  stage: { type: String, default: 'Uploading audio' },
  progress: { type: Number, default: 5 },
  error: String,
  analysis: mongoose.Schema.Types.Mixed,
  feedback: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});
reportSchema.index({ sessionId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);
