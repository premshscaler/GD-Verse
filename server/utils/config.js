// Central place for reading environment variables (with friendly aliases).
const pick = (...names) => {
  for (const n of names) if (process.env[n]) return process.env[n];
  return '';
};

const isProd = process.env.NODE_ENV === 'production';

const origins = pick('CLIENT_ORIGIN', 'FRONTEND_URL')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: pick('MONGO_URI', 'MONGODB_URI', 'MONGO_URL'),
  assemblyKey: pick('ASSEMBLYAI_API_KEY', 'ASSEMBLY_API_KEY', 'Assembly_API_KEY'),
  speechModels: pick('ASSEMBLYAI_SPEECH_MODELS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  clientOrigins: origins,
  isOriginAllowed(origin) {
    if (!origin) return true; // curl, server-to-server, same-origin
    const o = origin.replace(/\/$/, '');
    if (origins.includes(o)) return true;
    if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
    return false;
  },
};
