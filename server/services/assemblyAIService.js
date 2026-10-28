const axios = require('axios');
const config = require('../utils/config');

const BASE = 'https://api.assemblyai.com/v2';

function apiKey() {
  if (!config.assemblyKey || config.assemblyKey === 'your_actual_assemblyai_api_key_here') {
    const err = new Error('AssemblyAI API key is not configured on the server (set ASSEMBLYAI_API_KEY).');
    err.code = 'NO_KEY';
    throw err;
  }
  return config.assemblyKey; // never logged
}

// Turn an axios error into a message that tells the user what to do.
function explain(error, fallback) {
  const status = error.response && error.response.status;
  const detail = error.response && error.response.data && (error.response.data.error || error.response.data.message);
  if (status === 401 || status === 403) return 'AssemblyAI rejected the API key. Check ASSEMBLYAI_API_KEY on the server.';
  if (status === 402) return 'AssemblyAI account has no credit left or needs billing enabled.';
  if (status === 429) return 'AssemblyAI is rate limiting requests. Please retry in a minute.';
  if (detail) return `${fallback}: ${detail}`;
  if (error.code === 'ECONNABORTED') return `${fallback}: the request timed out.`;
  return `${fallback}: ${error.message}`;
}

async function uploadAudio(buffer) {
  try {
    const res = await axios.post(`${BASE}/upload`, buffer, {
      headers: { authorization: apiKey(), 'content-type': 'application/octet-stream' },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 180000,
    });
    return res.data.upload_url;
  } catch (e) {
    if (e.code === 'NO_KEY') throw e;
    throw new Error(explain(e, 'Audio upload to AssemblyAI failed'));
  }
}

async function createTranscript(audioUrl) {
  const body = {
    audio_url: audioUrl,
    language_code: 'en',
    punctuate: true,
    format_text: true,
    disfluencies: true, // keep "um"/"uh" so filler words can be counted
    sentiment_analysis: true,
    auto_highlights: true,
  };
  if (config.speechModels.length) body.speech_models = config.speechModels;
  try {
    const res = await axios.post(`${BASE}/transcript`, body, {
      headers: { authorization: apiKey(), 'content-type': 'application/json' },
      timeout: 30000,
    });
    return res.data;
  } catch (e) {
    if (e.code === 'NO_KEY') throw e;
    throw new Error(explain(e, 'Could not start transcription'));
  }
}

async function getTranscript(id) {
  try {
    const res = await axios.get(`${BASE}/transcript/${id}`, { headers: { authorization: apiKey() }, timeout: 30000 });
    return res.data;
  } catch (e) {
    if (e.code === 'NO_KEY') throw e;
    throw new Error(explain(e, 'Could not read transcription status'));
  }
}

async function waitForTranscript(id, { intervalMs = 3000, maxMs = 10 * 60 * 1000, onTick } = {}) {
  const started = Date.now();
  let transientErrors = 0;
  while (Date.now() - started < maxMs) {
    let t;
    try {
      t = await getTranscript(id);
      transientErrors = 0;
    } catch (e) {
      if (e.code === 'NO_KEY' || ++transientErrors >= 5) throw e;
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    if (t.status === 'completed') return t;
    if (t.status === 'error') throw new Error(`AssemblyAI could not transcribe the audio: ${t.error || 'unknown error'}`);
    if (onTick) onTick(t.status, Date.now() - started);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Transcription is taking too long. Please retry.');
}

module.exports = { uploadAudio, createTranscript, getTranscript, waitForTranscript };
