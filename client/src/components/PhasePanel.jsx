import { useState } from 'react';
import useCountdown, { formatClock } from '../hooks/useCountdown';

const PREP = [30, 60, 90];
const DISC = [180, 300, 600, 900];

export default function PhasePanel({ state, offset, isHost, hostName, onConfigure, onStart, onEnd, onReset }) {
  const [custom, setCustom] = useState('');
  const prepLeft = useCountdown(state.phase === 'prep' ? state.prepEndsAt : null, offset);
  const discLeft = useCountdown(state.phase === 'discussion' ? state.discussionEndsAt : null, offset);

  const left = state.phase === 'prep' ? prepLeft : discLeft;
  const urgent = state.phase === 'discussion' && discLeft != null && discLeft <= 10;
  const warn = state.phase === 'discussion' && discLeft != null && discLeft <= 60;
  const sel = 'border border-gray-300 rounded-lg p-2 text-gray-800 bg-white disabled:bg-gray-100 disabled:text-gray-500';

  if (state.phase === 'lobby') {
    return (
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800 text-lg">Lobby</h2>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{isHost ? 'You are the host' : `Host: ${hostName || '...'}`}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-sm text-gray-600">Preparation
            <select className={`${sel} w-full mt-1`} disabled={!isHost} value={state.prepSec} onChange={(e) => onConfigure({ prepSec: Number(e.target.value) })}>
              {PREP.map((s) => <option key={s} value={s}>{s} seconds</option>)}
            </select>
          </label>
          <label className="text-sm text-gray-600">Discussion
            <select className={`${sel} w-full mt-1`} disabled={!isHost} value={state.discussionSec} onChange={(e) => onConfigure({ discussionSec: Number(e.target.value) })}>
              {DISC.map((s) => <option key={s} value={s}>{s / 60} minutes</option>)}
            </select>
          </label>
        </div>
        {isHost ? (
          <>
            <input
              className={`${sel} w-full mb-3`}
              placeholder="Custom topic (optional - leave blank for a random one)"
              value={custom}
              maxLength={200}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button onClick={() => onStart(custom.trim())} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition">
              Start group discussion
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-500">Waiting for the host to start. Make sure your mic and camera look good.</p>
        )}
      </div>
    );
  }

  if (state.phase === 'ended') {
    return (
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 text-lg">Discussion ended</h2>
            <p className="text-sm text-gray-500">{state.endReason === 'host' ? 'The host ended the discussion.' : 'Time is up.'} Topic: {state.topic}</p>
          </div>
          {isHost && <button onClick={onReset} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">New round</button>}
        </div>
      </div>
    );
  }

  const isPrep = state.phase === 'prep';
  return (
    <div className={`rounded-xl shadow p-5 text-white ${isPrep ? 'bg-indigo-600' : urgent ? 'bg-red-600' : warn ? 'bg-amber-600' : 'bg-emerald-600'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider opacity-80">{isPrep ? 'Preparation - no speaking yet' : 'Discussion in progress - recording'}</div>
          <div className="text-lg sm:text-xl font-semibold mt-1">{state.topic}</div>
        </div>
        <div className={`text-4xl font-mono font-bold tabular-nums ${urgent ? 'animate-pulse' : ''}`} aria-label="Time left">{formatClock(left)}</div>
      </div>
      {warn && !isPrep && <div className="mt-2 text-sm font-medium">{urgent ? 'Wrap up now - 10 seconds left!' : 'One minute left - start concluding.'}</div>}
      {isHost && (
        <div className="mt-3 text-right">
          <button onClick={onEnd} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium">
            {isPrep ? 'Cancel round' : 'End discussion'}
          </button>
        </div>
      )}
    </div>
  );
}
