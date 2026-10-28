const test = require('node:test');
const assert = require('node:assert');
const { analyze, buildFeedback, groupSegments, countFillers } = require('../lib/analysis');

const mkWords = (spec) => spec.map(([text, start, end, confidence = 0.95]) => ({ text, start, end, confidence }));

test('empty transcript => noSpeech, zero score, clear feedback', () => {
  const a = analyze({ text: '', words: [] }, { userName: 'A', participantCount: 3, sharePercent: 0 });
  assert.equal(a.noSpeech, true);
  assert.equal(a.overallScore, 0);
  assert.match(buildFeedback(a).summary, /No speech was detected/);
});

test('segments split on gaps > 1.5s; speaking time, turns and WPM', () => {
  const words = mkWords([['hello', 0, 500], ['everyone', 600, 1200], ['today', 1300, 2000], ['we', 5000, 5300], ['discuss', 5400, 6000]]);
  const segs = groupSegments(words);
  assert.equal(segs.length, 2);
  const a = analyze({ text: 'hello everyone today we discuss', words }, { participantCount: 1, discussionMs: 60000 });
  assert.equal(a.turns, 2);
  assert.equal(a.speakingMs, 2000 + 1000 + 0);
  assert.equal(a.totalWords, 5);
  assert.equal(a.wpm, 100); // 5 words / 3s
});

test('filler words including pairs and rate per 100 words', () => {
  const tokens = 'um i think uh you know it is like basically fine i mean really'.split(' ');
  const f = countFillers(tokens);
  assert.equal(f.total, 6); // um, uh, you know, like, basically, i mean
  assert.equal(f.breakdown['you know'], 1);
  assert.equal(f.breakdown['i mean'], 1);
});

function speech(nWords, wpm, confidence = 0.95, extra = {}) {
  // one continuous segment at the requested pace
  const msPer = 60000 / wpm;
  const words = Array.from({ length: nWords }, (_, i) => ({ text: 'word' + i, start: Math.round(i * msPer), end: Math.round(i * msPer + msPer * 0.9), confidence }));
  return { text: words.map((w) => w.text).join(' '), words, ...extra };
}

test('good single-speaker run scores high and feedback agrees with the breakdown', () => {
  const t = speech(200, 130, 0.96, { sentiment_analysis_results: [{ sentiment: 'POSITIVE' }, { sentiment: 'NEUTRAL' }, { sentiment: 'NEUTRAL' }], auto_highlights_result: { results: [{ text: 'teamwork', rank: 0.9 }, { text: 'skills', rank: 0.5 }] } });
  const a = analyze(t, { userName: 'A', participantCount: 4, sharePercent: 28, discussionMs: 300000 });
  assert.equal(a.noSpeech, false);
  assert.ok(a.wpm >= 125 && a.wpm <= 140, 'wpm ' + a.wpm);
  assert.ok(a.overallScore >= 80, 'score ' + a.overallScore);
  assert.equal(a.breakdown.reduce((s, p) => s + p.max, 0), 100);
  assert.deepEqual(a.keyPoints, ['teamwork', 'skills']);
  const f = buildFeedback(a);
  assert.ok(f.strengths.length >= 3);
  assert.equal(f.improvements.length, 0);
});

test('weak run: low share, fillers and negativity lower the score and drive the tips', () => {
  const words = [];
  const fill = ['um', 'like', 'uh', 'so'];
  for (let i = 0; i < 40; i++) words.push({ text: i % 2 ? fill[i % 4] : 'point', start: i * 900, end: i * 900 + 500, confidence: 0.7 });
  const a = analyze({ text: 'x', words, sentiment_analysis_results: [{ sentiment: 'NEGATIVE' }, { sentiment: 'NEGATIVE' }, { sentiment: 'NEUTRAL' }] }, { participantCount: 4, sharePercent: 5, discussionMs: 300000 });
  assert.ok(a.overallScore < 55, 'score ' + a.overallScore);
  assert.ok(a.fillerRate > 10);
  const f = buildFeedback(a);
  assert.ok(f.improvements.some((t) => /Fluency/.test(t)));
  assert.ok(f.tips.length >= 1);
  const weakest = [...a.breakdown].sort((x, y) => x.score / x.max - y.score / y.max)[0];
  assert.ok(weakest.score / weakest.max < 0.6);
});

test('scores are deterministic and bounded; domination is penalised mildly', () => {
  const t = speech(150, 140);
  const fair = analyze(t, { participantCount: 4, sharePercent: 25, discussionMs: 300000 });
  const dom = analyze(t, { participantCount: 4, sharePercent: 80, discussionMs: 300000 });
  assert.equal(JSON.stringify(analyze(t, { participantCount: 4, sharePercent: 25, discussionMs: 300000 }).breakdown), JSON.stringify(fair.breakdown));
  assert.ok(dom.overallScore < fair.overallScore);
  assert.ok(dom.overallScore >= 0 && fair.overallScore <= 100);
});

test('very few words counts as no speech (not zeros shown as a result)', () => {
  const a = analyze(speech(3, 120), { participantCount: 2 });
  assert.equal(a.noSpeech, true);
  assert.equal(a.breakdown.every((p) => p.score === 0 && /No speech/.test(p.note)), true);
});

test('missing word timestamps still yields word counts from text', () => {
  const a = analyze({ text: 'this is a reasonably long sentence from fallback' }, { participantCount: 1 });
  assert.equal(a.totalWords, 8);
  assert.equal(a.speakingMs, 0);
  assert.equal(a.wpm, 0);
});
