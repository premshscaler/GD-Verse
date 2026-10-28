const PDFDocument = require('pdfkit');

const fmtDur = (ms) => {
  const s = Math.round((ms || 0) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};

/** Builds the PDF from a stored Report (+ optional Session and rank info). */
function generatePDF({ report, session, rank, total }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4', info: { Title: 'Group Discussion Report' } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width - 100;
      const need = (h) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };
      const h2 = (t) => { need(40); doc.moveDown(0.8).fontSize(15).fillColor('#111827').text(t).moveDown(0.3); };
      const body = (t, color = '#374151') => doc.fontSize(11).fillColor(color).text(t, { width: W });
      const bar = (label, value, max, note) => {
        need(34);
        const y = doc.y;
        doc.fontSize(10).fillColor('#374151').text(`${label}${note ? ' - ' + note : ''}`, 50, y, { width: W - 70 });
        doc.text(`${value}/${max}`, 50, y, { width: W, align: 'right' });
        const by = y + 15;
        doc.roundedRect(50, by, W, 7, 3).fill('#e5e7eb');
        doc.roundedRect(50, by, Math.max(2, (W * Math.min(value, max)) / max), 7, 3).fill('#2563eb');
        doc.y = by + 14;
        doc.x = 50;
      };

      const a = report && report.analysis;
      const f = report && report.feedback;

      doc.fontSize(22).fillColor('#2563eb').text('Group Discussion Report', { align: 'center' });
      doc.moveDown(0.3).fontSize(10).fillColor('#6b7280').text(`Generated ${new Date().toLocaleString()}`, { align: 'center' });

      h2('Overview');
      body(`Participant: ${(report && report.userName) || '-'}`);
      if (session && session.topic) body(`Topic: ${session.topic}`);
      if (session && session.discussionSec) body(`Discussion length: ${fmtDur(session.discussionSec * 1000)}`);
      if (rank && total) body(`Group rank: ${rank} of ${total}`);

      if (!a) {
        h2('Report unavailable');
        body((report && report.error) || 'This report has not finished processing yet.');
        doc.end();
        return;
      }

      if (a.noSpeech) {
        h2('No speech detected');
        body('We could not detect speech in this recording, so no score is shown. Check that your microphone was allowed and unmuted during the discussion.');
        doc.end();
        return;
      }

      doc.moveDown(0.5).fontSize(34).fillColor('#2563eb').text(`${a.overallScore}`, { continued: true }).fontSize(14).fillColor('#6b7280').text(' / 100');

      h2('Key numbers');
      body(`Speaking time: ${fmtDur(a.speakingMs)}${a.sharePercent != null ? ` (${a.sharePercent}% of the group)` : ''}`);
      body(`Words: ${a.totalWords}   Turns: ${a.turns}   Words per turn: ${a.wordsPerTurn}`);
      body(`Pace: ${a.wpm} words per minute`);
      body(`Clarity: ${a.clarity}%`);
      body(`Filler words: ${a.fillerCount} (${a.fillerRate} per 100 words)`);
      body(`Interruptions (approximate): ${a.interruptions || 0}`);
      const s = a.sentiments || {};
      body(`Tone: ${s.positive || 0} positive, ${s.neutral || 0} neutral, ${s.negative || 0} negative statements`);

      h2('Score breakdown');
      (a.breakdown || []).forEach((p) => bar(p.label, p.score, p.max, p.note));

      if (f) {
        h2('Summary');
        body(f.summary || '');
        if (f.strengths && f.strengths.length) { h2('Strengths'); f.strengths.forEach((t) => body(`• ${t}`)); }
        if (f.improvements && f.improvements.length) { h2('Areas to improve'); f.improvements.forEach((t) => body(`• ${t}`)); }
        if (f.tips && f.tips.length) { h2('Tips for next round'); f.tips.forEach((t) => body(`• ${t}`)); }
      }

      if (a.keyPoints && a.keyPoints.length) { h2('Key phrases'); body(a.keyPoints.join(', ')); }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generatePDF };
