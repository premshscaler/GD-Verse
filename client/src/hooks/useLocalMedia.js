import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Acquires camera + mic once. Falls back to audio-only if there is no camera.
 * status: 'idle' | 'loading' | 'ready' | 'denied' | 'skipped'
 */
export default function useLocalMedia() {
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [hasVideo, setHasVideo] = useState(false);
  const streamRef = useRef(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const request = useCallback(async () => {
    setStatus('loading');
    setError('');
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Your browser does not support camera/microphone access. Use a recent Chrome, Edge, Firefox or Safari over HTTPS.');
      setStatus('denied');
      return;
    }
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try {
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({ audio, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } });
      } catch (e) {
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
        s = await navigator.mediaDevices.getUserMedia({ audio, video: false }); // no camera: audio-only
      }
      streamRef.current = s;
      setHasVideo(s.getVideoTracks().length > 0);
      setStream(s);
      setStatus('ready');
    } catch (e) {
      const msg = e.name === 'NotAllowedError'
        ? 'Microphone permission was blocked. Click the lock icon in the address bar, allow Microphone (and Camera), then press Try again.'
        : e.name === 'NotFoundError'
          ? 'No microphone was found. Plug one in and press Try again.'
          : e.name === 'NotReadableError'
            ? 'Your microphone is being used by another app. Close it and press Try again.'
            : `Could not access your microphone (${e.name || 'error'}).`;
      setError(msg);
      setStatus('denied');
    }
  }, []);

  useEffect(() => {
    request();
    return stop;
  }, [request]);

  const skip = () => { setStatus('skipped'); };

  const setEnabled = useCallback((kind, on) => {
    const tracks = kind === 'audio' ? streamRef.current?.getAudioTracks() : streamRef.current?.getVideoTracks();
    tracks?.forEach((t) => { t.enabled = on; });
  }, []);

  return { stream, status, error, hasVideo, retry: request, skip, setEnabled };
}
