/**
 * Pure analysis maths: AssemblyAI transcript payload -> metrics -> score -> feedback.
 * Each audio file holds exactly one speaker (recorded locally), so no diarization is needed.
 */
const SEGMENT_GAP_MS = 1500;
const MIN_WORDS_FOR_SPEECH = 5;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z']/g, '');

const SINGLE_FILLERS = new Set(['um', 'uh', 'umm', 'uhh', 'uhm', 'er', 'erm', 'hmm', 'like', 'basically', 'actually', 'so']);
const PAIR_FILLERS = [['you', 'know'], ['i', 'mean']];

function groupSegments(words) {
  const segs = [];
  for (const w of words) {
    if (typeof w.start !== 'number' || typeof w.end !== 'number') continue;
    const last = segs[segs.length - 1];
    if (last && w.start - last.end <= SEGMENT_GAP_MS) {
      last.end = Math.max(last.end, w.end);
      last.words += 1;
    } else {
      segs.push({ start: w.start, end: w.end, words: 1 });
    }
  }
  return segs;
}

function countFillers(tokens) {
  const found = {};
  const bump = (k) => { found[k] = (found[k] || 0) + 1; };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const pair = PAIR_FILLERS.find(([a, b]) => t === a && tokens[i + 1] === b);
    if (pair) { bump(pair.join(' ')); i += 1; continue; }
    if (SINGLE_FILLERS.has(t)) bump(t);
  }
  const total = Object.values(found).reduce((s, n) => s + n, 0);
  return { total, breakdown: found };
}

/**
 * @param transcript  AssemblyAI transcript object (status completed)
 * @param ctx         { userName, sharePercent (0-100|null), participantCount, discussionMs, live: {speakingMs, turns, interruptions}|null }
 */
function analyze(transcript, ctx = {}) {
  const words = Array.isArray(transcript && transcript.words) ? transcript.words : [];
  const text = (transcript && transcript.text) || '';
  const tokens = words.length ? words.map((w) => norm(w.text)).filter(Boolean) : text.split(/\s+/).map(norm).filter(Boolean);
  const totalWords = tokens.length;

  const segments = groupSegments(words);
  const speakingMs = segments.reduce((s, g) => s + (g.end - g.start), 0);
  const turns = segments.length;
  const wpm = speakingMs > 0 ? totalWords / (speakingMs / 60000) : 0;

  const confs = words.map((w) => w.confidence).filter((c) => typeof c === 'number');
  const clarity = confs.length ? (confs.reduce((s, c) => s + c, 0) / confs.length) * 100 : (typeof transcript?.confidence === 'number' ? transcript.confidence * 100 : 0);

  const fillers = countFillers(tokens);
  const fillerRate = totalWords ? (fillers.total / totalWords) * 100 : 0;

  const sentiments = { positive: 0, neutral: 0, negative: 0 };
  for (const s of (transcript && transcript.sentiment_analysis_results) || []) {
    const k = String(s.sentiment || '').toLowerCase();
    if (k in sentiments) sentiments[k] += 1;
  }
  const sentTotal = sentiments.positive + sentiments.neutral + sentiments.negative;

  const keyPoints = ((transcript && transcript.auto_highlights_result && transcript.auto_highlights_result.results) || [])
    .slice().sort((a, b) => (b.rank || 0) - (a.rank || 0)).slice(0, 6).map((h) => h.text).filter(Boolean);

  const noSpeech = totalWords < MIN_WORDS_FOR_SPEECH;
  const live = ctx.live || null;

  return {
    userName: ctx.userName || '',
    noSpeech,
    totalWords,
    speakingMs,
    turns,
    wpm: Math.round(wpm),
    wordsPerTurn: turns ? round1(totalWords / turns) : 0,
    clarity: Math.round(clarity),
    fillerCount: fillers.total,
    fillerRate: round1(fillerRate),
    fillerBreakdown: fillers.breakdown,
    sentiments,
    sentimentTotal: sentTotal,
    keyPoints,
    sharePercent: typeof ctx.sharePercent === 'number' ? Math.round(ctx.sharePercent) : null,
    participantCount: ctx.participantCount || 1,
    discussionMs: ctx.discussionMs || 0,
    liveSpeakingMs: live ? live.speakingMs : null,
    interruptions: live ? live.interruptions : 0,
    transcript: text,
    ...score({ noSpeech, totalWords, speakingMs, turns, wpm, clarity, fillerRate, sentiments, sentTotal, ctx }),
  };
}

function score({ noSpeech, totalWords, speakingMs, turns, wpm, clarity, fillerRate, sentiments, sentTotal, ctx }) {
  const parts = [];
  const add = (key, label, max, value, note) => parts.push({ key, label, max, score: Math.round(clamp(value, 0, max) * 10) / 10, note });

  if (noSpeech) {
    for (const [key, label, max] of [['participation', 'Participation', 30], ['pace', 'Pace', 15], ['clarity', 'Clarity', 20], ['fillers', 'Fluency (fillers)', 15], ['tone', 'Tone', 10], ['depth', 'Contribution depth', 10]]) {
      add(key, label, max, 0, 'No speech detected');
    }
    return { overallScore: 0, breakdown: parts };
  }

  // Participation (30): fair share of the floor, mild penalty for dominating.
  const n = Math.max(1, ctx.participantCount || 1);
  let ratio;
  if (n > 1 && typeof ctx.sharePercent === 'number') ratio = ctx.sharePercent / (100 / n);
  else ratio = ctx.discussionMs ? speakingMs / (ctx.discussionMs * 0.4) : 1; // solo: aim for ~40% of the time
  let part = ratio <= 1 ? 30 * ratio : ratio <= 1.6 ? 30 : 30 * Math.max(0.7, 1 - (ratio - 1.6) * 0.3);
  add('participation', 'Participation', 30, part,
    ratio < 0.6 ? 'Below your fair share of speaking time' : ratio > 1.6 ? 'You spoke much more than your fair share' : 'Balanced share of speaking time');

  // Pace (15): 110-160 WPM is a comfortable range.
  let pace;
  if (wpm >= 110 && wpm <= 160) pace = 15;
  else if (wpm >= 80 && wpm < 110) pace = 9 + ((wpm - 80) / 30) * 6;
  else if (wpm > 160 && wpm <= 190) pace = 15 - ((wpm - 160) / 30) * 6;
  else if (wpm < 80) pace = 9 * (wpm / 80);
  else pace = Math.max(3, 9 - (wpm - 190) / 10);
  add('pace', 'Pace', 15, pace, wpm < 110 ? 'A little slow' : wpm > 160 ? 'A little fast' : 'Comfortable pace');

  // Clarity (20): mean word confidence, 60% -> 0, 90%+ -> full.
  add('clarity', 'Clarity', 20, 20 * clamp((clarity - 60) / 30, 0, 1), clarity >= 85 ? 'Clearly understood' : 'Some words were hard to recognise');

  // Fillers (15): <=2 per 100 words is full marks, >=10 is zero.
  add('fillers', 'Fluency (fillers)', 15, 15 * (1 - clamp((fillerRate - 2) / 8, 0, 1)), fillerRate <= 3 ? 'Very few filler words' : 'Frequent filler words');

  // Tone (10): penalise negative sentiment share; neutral if unavailable.
  const negShare = sentTotal ? sentiments.negative / sentTotal : 0;
  add('tone', 'Tone', 10, sentTotal ? 10 * (1 - negShare) : 7, negShare > 0.35 ? 'Leaned negative' : 'Positive / neutral tone');

  // Depth (10): words per turn, 8 -> low, 40+ -> full.
  const wpt = turns ? totalWords / turns : 0;
  add('depth', 'Contribution depth', 10, Math.max(2, 10 * clamp((wpt - 8) / 32, 0, 1)), wpt < 15 ? 'Mostly short interjections' : 'Developed points');

  const overall = Math.round(parts.reduce((s, p) => s + p.score, 0));
  return { overallScore: clamp(overall, 0, 100), breakdown: parts };
}

const TIPS = {
  participation: 'Aim to speak in every phase of the discussion. Enter early and add a fresh point each time.',
  pace: 'Practise at roughly 120-150 words per minute. Pause between points instead of rushing or trailing off.',
  clarity: 'Speak closer to the mic, finish your words, and reduce background noise so every word lands.',
  fillers: 'Replace "um", "like" and "you know" with a short silent pause. Try structuring points as Point - Reason - Example.',
  tone: 'Disagree with the idea, not the person. Start rebuttals with something you agree with.',
  depth: 'Make fewer, fuller contributions: state your view, back it with a reason, and close with an example.',
};

function buildFeedback(a) {
  if (a.noSpeech) {
    return {
      summary: 'No speech was detected in your recording, so there is nothing to score for this round.',
      strengths: [],
      improvements: ['Check that your microphone was allowed and not muted during the discussion.'],
      tips: ['Next round: unmute before the discussion starts and speak at least a few full sentences.'],
    };
  }
  const strengths = [];
  const improvements = [];
  for (const p of a.breakdown) {
    const r = p.score / p.max;
    if (r >= 0.8) strengths.push(`${p.label}: ${p.note.toLowerCase()} (${p.score}/${p.max}).`);
    else if (r < 0.6) improvements.push(`${p.label}: ${p.note.toLowerCase()} (${p.score}/${p.max}).`);
  }
  const weakest = [...a.breakdown].sort((x, y) => x.score / x.max - y.score / y.max).slice(0, 2);
  const tips = weakest.filter((p) => p.score / p.max < 0.85).map((p) => TIPS[p.key]);
  if (!tips.length) tips.push('Keep it up. Try summarising the discussion at the end to show leadership.');
  const band = a.overallScore >= 80 ? 'Excellent' : a.overallScore >= 65 ? 'Good' : a.overallScore >= 45 ? 'Fair' : 'Needs work';
  return {
    summary: `${band}: you scored ${a.overallScore}/100 with ${a.totalWords} words across ${a.turns} turn${a.turns === 1 ? '' : 's'}.`,
    strengths,
    improvements,
    tips,
  };
}

module.exports = { analyze, buildFeedback, groupSegments, countFillers };
