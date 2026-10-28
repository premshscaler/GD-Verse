import { useEffect, useRef, useState } from 'react';

/**
 * Voice-activity detection on the local mic track (WebAudio analyser + hysteresis).
 * Calls onStart / onStop automatically; no manual "Start talking" button.
 *  - needs ~150 ms of sound to start, ~700 ms of quiet to stop (hangover)
 *  - threshold adapts to the room's noise floor
 */
export default function useVoiceActivity(stream, { enabled, micOn, onStart, onStop }) {
  const [speaking, setSpeaking] = useState(false);
  const cb = useRef({ onStart, onStop });
  cb.current = { onStart, onStop };

  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!enabled || !track) return undefined;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return undefined;

    const ctx = new AC();
    const resume = () => ctx.state === 'suspended' && ctx.resume().catch(() => {});
    resume();
    window.addEventListener('click', resume);

    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    let floor = 0.006;
    let on = false;
    let above = 0;
    let below = 0;
    const STEP = 50;

    const fire = (next) => {
      if (next === on) return;
      on = next;
      setSpeaking(next);
      if (next) cb.current.onStart?.(); else cb.current.onStop?.();
    };

    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      if (!on) floor = floor * 0.98 + Math.min(rms, 0.05) * 0.02; // learn the background level while quiet
      const hi = Math.max(0.018, floor * 3.5);
      const lo = Math.max(0.011, floor * 2);

      if (!track.enabled || micOn.current === false) { above = 0; below += STEP; if (on && below >= 100) fire(false); return; }
      if (rms > (on ? lo : hi)) { above += STEP; below = 0; } else { below += STEP; above = 0; }
      if (!on && above >= 150) fire(true);
      if (on && below >= 700) fire(false);
    }, STEP);

    return () => {
      clearInterval(timer);
      window.removeEventListener('click', resume);
      if (on) cb.current.onStop?.();
      setSpeaking(false);
      src.disconnect();
      ctx.close().catch(() => {});
    };
  }, [stream, enabled, micOn]);

  return speaking;
}
