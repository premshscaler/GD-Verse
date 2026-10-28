// Single source for backend URL. Set VITE_SERVER_URL in Netlify/Vercel (no trailing slash).
const raw = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');

export const SERVER_URL = raw.replace(/\/$/, '');
export const CONFIG_MISSING = !SERVER_URL;

if (CONFIG_MISSING) {
  console.error('VITE_SERVER_URL is not set. Add it to your hosting environment variables and redeploy.');
}

export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ...(import.meta.env.VITE_TURN_URL
    ? [{
        urls: import.meta.env.VITE_TURN_URL.split(',').map((s) => s.trim()),
        username: import.meta.env.VITE_TURN_USERNAME || '',
        credential: import.meta.env.VITE_TURN_CREDENTIAL || '',
      }]
    : []),
];
