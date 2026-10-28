import { useEffect, useRef, useState } from 'react';

const CANDIDATES = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
];

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of CANDIDATES) {
    try { if (MediaRecorder.isTypeSupported(mime)) return { mime, ext }; } catch { /* next */ }
  }
  return { mime: '', ext: 'webm' }; // let the browser choose
}

/**
 * Records only the local microphone while `active` is true (the Discussion phase).
 * When `active` turns false the recording is finalised into `result` ({blob, ext}).
 * `reset` clears it for the next round.
 */
export default function useRecorder(stream, active, resetKey) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const chunks = useRef([]);

  useEffect(() => { setResult(null); setError(''); }, [resetKey]);

  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!active || !track) return undefined;
    const pick = pickMime();
    if (!pick) { setError('This browser cannot record audio. Use a recent Chrome, Edge, Firefox or Safari.'); return undefined; }

    let rec;
    try {
      rec = new MediaRecorder(new MediaStream([track]), pick.mime ? { mimeType: pick.mime } : undefined);
    } catch (e) {
      setError('Could not start the recorder: ' + e.message);
      return undefined;
    }
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || pick.mime || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      setResult({ blob: new Blob(chunks.current, { type }), ext });
    };
    rec.onerror = (e) => setError('Recording error: ' + (e.error?.message || 'unknown'));
    rec.start(1000);
    recRef.current = rec;

    return () => {
      if (rec.state !== 'inactive') rec.stop();
      recRef.current = null;
    };
  }, [stream, active]);

  return { result, error };
}
