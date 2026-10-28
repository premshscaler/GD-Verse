import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { SERVER_URL } from '../utils/config';

const api = (p) => `${SERVER_URL}/api/analysis${p}`;
const fmtDur = (ms) => { const s = Math.round((ms || 0) / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };

function Metric({ label, value, hint }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
}

function Bullets({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className={`font-semibold mb-1 ${tone}`}>{title}</h4>
      <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

function Personal({ r, sessionId, clientId }) {
  const a = r.analysis;
  const f = r.feedback;
  if (!a) return null;
  if (a.noSpeech) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="font-semibold text-amber-800 mb-1">No speech detected</h3>
        <p className="text-sm text-amber-800">We could not hear you in this round, so there is no score to show. Check that your microphone was allowed and unmuted, then speak at least a few sentences next time.</p>
      </div>
    );
  }
  const s = a.sentiments || {};
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-5">
        <div className="w-24 h-24 rounded-full bg-blue-600 text-white flex flex-col items-center justify-center shrink-0">
          <span className="text-3xl font-bold leading-none">{a.overallScore}</span>
          <span className="text-[10px] opacity-80">out of 100</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{r.userName}</h3>
          <p className="text-sm text-gray-600">{f?.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Speaking time" value={fmtDur(a.speakingMs)} hint={a.sharePercent != null ? `${a.sharePercent}% of the group` : ''} />
        <Metric label="Words" value={a.totalWords} hint={`${a.turns} turns`} />
        <Metric label="Pace" value={`${a.wpm} wpm`} hint="ideal 110-160" />
        <Metric label="Clarity" value={`${a.clarity}%`} />
        <Metric label="Filler words" value={a.fillerCount} hint={`${a.fillerRate} per 100 words`} />
        <Metric label="Words per turn" value={a.wordsPerTurn} />
        <Metric label="Interruptions" value={a.interruptions || 0} hint="approximate" />
        <Metric label="Tone" value={`${s.positive || 0}+ ${s.neutral || 0}= ${s.negative || 0}-`} hint="pos / neutral / neg" />
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 mb-2">Score breakdown</h4>
        <div className="space-y-2">
          {a.breakdown.map((p) => (
            <div key={p.key}>
              <div className="flex justify-between text-sm text-gray-700"><span>{p.label} <span className="text-gray-400">- {p.note}</span></span><span>{p.score}/{p.max}</span></div>
              <div className="h-2 bg-gray-200 rounded"><div className="h-2 bg-blue-600 rounded" style={{ width: `${(p.score / p.max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Bullets title="Strengths" items={f?.strengths} tone="text-green-700" />
        <Bullets title="Improve" items={f?.improvements} tone="text-red-700" />
        <Bullets title="Next round" items={f?.tips} tone="text-blue-700" />
      </div>

      {a.keyPoints?.length > 0 && <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">Key phrases: </span>{a.keyPoints.join(', ')}</p>}
      {a.transcript && (
        <details className="text-sm text-gray-600"><summary className="cursor-pointer font-semibold text-gray-800">Your transcript</summary><p className="mt-2 whitespace-pre-wrap">{a.transcript}</p></details>
      )}

      <a href={api(`/download/${sessionId}/${clientId}`)} className="inline-block bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-black text-sm">Download PDF</a>
    </div>
  );
}

function Leaderboard({ group, clientId }) {
  if (!group) return null;
  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <h3 className="font-semibold text-gray-800 text-lg">Group comparison</h3>
        {group.pending > 0 && <span className="text-xs text-gray-500">Waiting for {group.pending} more report{group.pending > 1 ? 's' : ''}...</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-3">#</th><th className="pr-3">Name</th><th className="pr-3">Score</th><th className="pr-3">Speaking</th><th className="pr-3">Share</th><th className="pr-3">Words</th><th className="pr-3">WPM</th><th>Interruptions</th></tr></thead>
          <tbody>
            {group.participants.map((p) => (
              <tr key={p.clientId} className={`border-b last:border-0 ${p.clientId === clientId ? 'bg-blue-50 font-medium' : ''}`}>
                <td className="py-2 pr-3">{p.rank ?? '-'}</td>
                <td className="pr-3">{p.name}{p.clientId === clientId ? ' (you)' : ''}</td>
                <td className="pr-3">{p.overallScore ?? (p.noSpeech ? 'no speech' : p.status === 'failed' ? 'failed' : '...')}</td>
                <td className="pr-3">{fmtDur(p.speakingMs)}</td>
                <td className="pr-3">{p.sharePercent}%</td>
                <td className="pr-3">{p.words ?? '-'}</td>
                <td className="pr-3">{p.wpm ?? '-'}</td>
                <td>{p.interruptions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Props: sessionId, clientId, userName, roomId
 *        blob/ext   - this learner's recording (omit when viewing a past report)
 *        viewOnly   - never upload, only show what is stored
 *        noRecording - reason text when this person has nothing to upload
 */
export default function AnalysisReport({ sessionId, clientId, userName, roomId, blob, ext, viewOnly, noRecording }) {
  const [uploadState, setUploadState] = useState(viewOnly ? 'done' : 'idle'); // idle | uploading | done | error
  const [uploadErr, setUploadErr] = useState('');
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState(null);
  const [group, setGroup] = useState(null);
  const [missing, setMissing] = useState(false);
  const started = useRef('');

  const upload = useCallback(async () => {
    if (!blob) return;
    setUploadState('uploading'); setUploadErr(''); setPct(0); setResult(null);
    const fd = new FormData();
    fd.append('audio', blob, `${userName || 'speaker'}.${ext || 'webm'}`);
    fd.append('roomId', roomId || '');
    fd.append('sessionId', sessionId);
    fd.append('clientId', clientId);
    fd.append('userName', userName);
    try {
      await axios.post(api('/upload'), fd, { timeout: 180000, onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)) });
      setUploadState('done');
    } catch (e) {
      setUploadErr(e.response?.data?.message || (e.response ? 'The server rejected the recording.' : 'Could not reach the server. Check your connection and retry.'));
      setUploadState('error');
    }
  }, [blob, ext, roomId, sessionId, clientId, userName]);

  // Auto-upload exactly once per recording.
  useEffect(() => {
    if (viewOnly || !blob || !sessionId) return;
    const key = `${sessionId}:${blob.size}`;
    if (started.current === key) return;
    started.current = key;
    upload();
  }, [viewOnly, blob, sessionId, upload]);

  // Poll the personal report.
  useEffect(() => {
    if (uploadState !== 'done' || !sessionId) return undefined;
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        const { data } = await axios.get(api(`/result/${sessionId}/${clientId}`));
        if (stop) return;
        setResult(data); setMissing(false);
        if (data.status === 'completed' || data.status === 'failed') return;
      } catch (e) {
        if (e.response?.status === 404) setMissing(true);
      }
      if (!stop) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [uploadState, sessionId, clientId]);

  // Poll the group report until everyone's is in.
  useEffect(() => {
    if (!sessionId) return undefined;
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        const { data } = await axios.get(api(`/session/${sessionId}`));
        if (stop) return;
        setGroup(data);
        if (data.pending === 0) return;
      } catch { /* keep trying */ }
      if (!stop) timer = setTimeout(tick, 5000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [sessionId, result?.status]);

  const copyLink = () => navigator.clipboard?.writeText(`${window.location.origin}/report/${sessionId}`);
  const processing = uploadState === 'done' && (!result || result.status === 'processing');

  return (
    <div className="bg-white rounded-xl shadow p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Your report</h2>
        <button onClick={copyLink} className="text-xs text-blue-600 hover:underline">Copy report link</button>
      </div>

      {noRecording && !blob && !viewOnly && <p className="text-sm text-gray-600">{noRecording}</p>}

      {uploadState === 'uploading' && (
        <div><p className="text-sm text-gray-700 mb-1">Uploading your recording... {pct}%</p><div className="h-2 bg-gray-200 rounded"><div className="h-2 bg-blue-600 rounded transition-all" style={{ width: `${pct}%` }} /></div></div>
      )}
      {uploadState === 'error' && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          <p className="mb-2">{uploadErr}</p>
          <button onClick={upload} className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">Retry upload</button>
        </div>
      )}
      {processing && !missing && (
        <div>
          <p className="text-sm text-gray-700 mb-1">Generating your report... <span className="text-gray-500">{result?.stage || 'Starting'}</span></p>
          <div className="h-2 bg-gray-200 rounded"><div className="h-2 bg-blue-600 rounded transition-all" style={{ width: `${result?.progress || 5}%` }} /></div>
          <p className="text-xs text-gray-400 mt-1">This usually takes under a minute. You can keep this page open.</p>
        </div>
      )}
      {viewOnly && missing && <p className="text-sm text-gray-600">No personal report exists for this browser tab. The group comparison is below.</p>}
      {result?.status === 'failed' && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          <p className="mb-2">{result.error || 'We could not generate your report.'}</p>
          {blob && !viewOnly && <button onClick={upload} className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">Try again</button>}
        </div>
      )}
      {result?.status === 'completed' && <Personal r={result} sessionId={sessionId} clientId={clientId} />}

      <Leaderboard group={group} clientId={clientId} />
    </div>
  );
}
