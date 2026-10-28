const express = require('express');
const multer = require('multer');
const dbConnect = require('../utils/dbConnect');
const Report = require('../models/Report');
const Session = require('../models/Session');
const assembly = require('../services/assemblyAIService');
const { analyze, buildFeedback } = require('../lib/analysis');
const { generatePDF } = require('../services/reportService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^(audio|video)\//.test(file.mimetype) || file.mimetype === 'application/octet-stream') return cb(null, true);
    cb(new Error('Only audio files can be uploaded.'));
  },
});

const STALE_MS = 20 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isId = (v, max = 80) => typeof v === 'string' && /^[\w.-]+$/.test(v) && v.length <= max;

async function setStage(sessionId, clientId, patch) {
  await Report.updateOne({ sessionId, clientId }, { $set: patch });
}

async function loadSession(sessionId) {
  // The session row is written when the round ends; allow a short race window.
  for (let i = 0; i < 6; i++) {
    const s = await Session.findOne({ sessionId }).lean();
    if (s) return s;
    await sleep(1000);
  }
  return null;
}

function contextFor(session, clientId, userName) {
  const parts = (session && session.participants) || [];
  const total = parts.reduce((s, p) => s + (p.speakingMs || 0), 0);
  const me = parts.find((p) => p.clientId === clientId);
  const discussionMs = session && session.discussionStartedAt && session.endedAt
    ? new Date(session.endedAt) - new Date(session.discussionStartedAt) : 0;
  return {
    userName,
    participantCount: parts.length || 1,
    sharePercent: me && total > 0 ? (me.speakingMs / total) * 100 : null,
    discussionMs,
    live: me ? { speakingMs: me.speakingMs, turns: me.turns, interruptions: me.interruptions } : null,
  };
}

// Runs in the background after the HTTP response has been sent.
async function processReport({ sessionId, clientId, userName, buffer }) {
  try {
    const session = await loadSession(sessionId);
    const ctx = contextFor(session, clientId, userName);

    let transcript;
    if (buffer.length < 1500) {
      transcript = { text: '', words: [] }; // nothing meaningful was recorded
    } else {
      await setStage(sessionId, clientId, { stage: 'Uploading audio', progress: 15 });
      const url = await assembly.uploadAudio(buffer);
      await setStage(sessionId, clientId, { stage: 'Transcribing your speech', progress: 35 });
      const created = await assembly.createTranscript(url);
      transcript = await assembly.waitForTranscript(created.id, {
        onTick: (status, elapsed) => {
          const p = Math.min(80, 35 + Math.round(elapsed / 1000));
          setStage(sessionId, clientId, { stage: status === 'queued' ? 'Waiting in queue' : 'Transcribing your speech', progress: p }).catch(() => {});
        },
      });
    }

    await setStage(sessionId, clientId, { stage: 'Scoring your discussion', progress: 90 });
    const analysis = analyze(transcript, ctx);
    const feedback = buildFeedback(analysis);
    await setStage(sessionId, clientId, { status: 'completed', stage: 'Done', progress: 100, analysis, feedback, error: null });
  } catch (err) {
    console.error(`Report job failed (${sessionId}/${clientId}):`, err.message);
    await setStage(sessionId, clientId, { status: 'failed', stage: 'Failed', error: err.message }).catch(() => {});
  }
}

router.post('/upload', (req, res) => {
  upload.single('audio')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed.' });
    try {
      const { roomId, sessionId, clientId } = req.body || {};
      const userName = String((req.body && req.body.userName) || '').trim().slice(0, 40);
      if (!req.file) return res.status(400).json({ message: 'No audio file was received.' });
      if (!isId(sessionId) || !isId(clientId, 64) || !userName) {
        return res.status(400).json({ message: 'sessionId, clientId and userName are required.' });
      }
      await dbConnect();
      const existing = await Report.findOne({ sessionId, clientId }).lean();
      if (existing && existing.status === 'processing' && Date.now() - new Date(existing.createdAt) < STALE_MS) {
        return res.json({ reportId: String(existing._id), status: 'processing', message: 'Already processing.' });
      }
      const doc = await Report.findOneAndUpdate(
        { sessionId, clientId },
        { $set: { roomId, userName, status: 'processing', stage: 'Uploading audio', progress: 5, error: null, analysis: null, feedback: null, createdAt: new Date() } },
        { upsert: true, new: true }
      );
      res.status(202).json({ reportId: String(doc._id), status: 'processing' });
      processReport({ sessionId, clientId, userName, buffer: req.file.buffer });
    } catch (e) {
      console.error('Upload handler error:', e.message);
      res.status(500).json({ message: 'Could not store your recording. Please retry.' });
    }
  });
});

router.get('/result/:sessionId/:clientId', async (req, res) => {
  try {
    const { sessionId, clientId } = req.params;
    await dbConnect();
    let r = await Report.findOne({ sessionId, clientId }).lean();
    if (!r) return res.status(404).json({ status: 'missing', message: 'No report found yet.' });
    if (r.status === 'processing' && Date.now() - new Date(r.createdAt) > STALE_MS) {
      r = { ...r, status: 'failed', error: 'Processing was interrupted (the server may have restarted). Please retry the upload.' };
    }
    res.json({ status: r.status, stage: r.stage, progress: r.progress, error: r.error, userName: r.userName, analysis: r.analysis, feedback: r.feedback });
  } catch (e) {
    res.status(500).json({ message: 'Could not load the report.' });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await dbConnect();
    const [session, reports] = await Promise.all([
      Session.findOne({ sessionId }).lean(),
      Report.find({ sessionId }).lean(),
    ]);
    if (!session && !reports.length) return res.status(404).json({ message: 'Session not found.' });
    const parts = (session && session.participants) || [];
    const total = parts.reduce((s, p) => s + (p.speakingMs || 0), 0);
    const rows = parts.map((p) => {
      const r = reports.find((x) => x.clientId === p.clientId);
      const a = r && r.analysis;
      return {
        clientId: p.clientId,
        name: p.name,
        status: r ? r.status : 'waiting',
        speakingMs: p.speakingMs,
        sharePercent: total ? Math.round((p.speakingMs / total) * 100) : 0,
        turns: p.turns,
        interruptions: p.interruptions,
        overallScore: a && !a.noSpeech ? a.overallScore : null,
        noSpeech: !!(a && a.noSpeech),
        words: a ? a.totalWords : null,
        wpm: a ? a.wpm : null,
      };
    });
    rows.sort((x, y) => (y.overallScore ?? -1) - (x.overallScore ?? -1) || y.speakingMs - x.speakingMs);
    rows.forEach((row, i) => { row.rank = row.overallScore != null ? i + 1 : null; });
    res.json({
      sessionId,
      topic: session && session.topic,
      discussionSec: session && session.discussionSec,
      endedAt: session && session.endedAt,
      pending: rows.filter((r) => r.status === 'processing' || r.status === 'waiting').length,
      participants: rows,
    });
  } catch (e) {
    res.status(500).json({ message: 'Could not load the group report.' });
  }
});

router.get('/download/:sessionId/:clientId', async (req, res) => {
  try {
    const { sessionId, clientId } = req.params;
    await dbConnect();
    const [report, session, all] = await Promise.all([
      Report.findOne({ sessionId, clientId }).lean(),
      Session.findOne({ sessionId }).lean(),
      Report.find({ sessionId, status: 'completed' }).lean(),
    ]);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (report.status !== 'completed') return res.status(409).json({ message: 'The report is not ready yet.' });
    const ranked = all.filter((r) => r.analysis && !r.analysis.noSpeech).sort((a, b) => b.analysis.overallScore - a.analysis.overallScore);
    const idx = ranked.findIndex((r) => r.clientId === clientId);
    const pdf = await generatePDF({ report, session, rank: idx >= 0 ? idx + 1 : null, total: ranked.length });
    const safe = (report.userName || 'participant').replace(/[^\w-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="GD_Report_${safe}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (e) {
    console.error('PDF error:', e.message);
    res.status(500).json({ message: 'Could not generate the PDF.' });
  }
});

module.exports = router;
