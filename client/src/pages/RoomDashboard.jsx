import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import useLocalMedia from '../hooks/useLocalMedia';
import useRoomSocket from '../hooks/useRoomSocket';
import useWebRTC from '../hooks/useWebRTC';
import useVoiceActivity from '../hooks/useVoiceActivity';
import useRecorder from '../hooks/useRecorder';
import useCountdown from '../hooks/useCountdown';
import { getClientId, getSavedName } from '../utils/identity';
import VideoGrid from '../components/VideoGrid';
import PhasePanel from '../components/PhasePanel';
import Controls from '../components/Controls';
import UserList from '../components/UserList';
import ContributionPie from '../components/ContributionPie';
import AnalysisReport from '../components/AnalysisReport';
import Toasts from '../components/Toasts';
import ConfirmModal from '../components/ConfirmModal';

export default function RoomDashboard() {
  const { id: roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const clientId = useMemo(() => getClientId(), []);
  const name = location.state?.name || getSavedName();

  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const micRef = useRef(true);
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null); // 'end' | 'leave' | null
  const [slow, setSlow] = useState(false);

  const toast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  // No name (opened a shared link directly)? Ask for it on the join page.
  useEffect(() => { if (!name) navigate(`/join?room=${roomId}`, { replace: true }); }, [name, roomId, navigate]);

  const media = useLocalMedia();
  const ready = !!name && (media.status === 'ready' || media.status === 'skipped');
  const rs = useRoomSocket({ roomId, clientId, name, ready });
  const { state, participants, contributions, offset, joined, error, emit } = rs;

  const remoteStreams = useWebRTC({ socket: rs.socket, localStream: media.stream, joined, joinCount: rs.joinCount });

  const phase = state?.phase;
  const inDiscussion = phase === 'discussion';
  const isHost = !!state && state.hostClientId === clientId;
  const hostName = participants.find((p) => p.isHost)?.name;
  const self = joined?.self;

  const speaking = useVoiceActivity(media.stream, {
    enabled: inDiscussion && ready,
    micOn: micRef,
    onStart: () => emit('start-speaking'),
    onStop: () => emit('stop-speaking'),
  });
  const rec = useRecorder(media.stream, inDiscussion, state?.sessionId);

  // --- warnings at 60 s and 10 s (derived from the shared deadline) ---
  const discLeft = useCountdown(inDiscussion ? state.discussionEndsAt : null, offset);
  const warned = useRef({});
  useEffect(() => {
    if (!inDiscussion || discLeft == null || !state?.sessionId) return;
    const key = state.sessionId;
    const w = (warned.current[key] ||= {});
    if (discLeft <= 60 && discLeft > 10 && !w.m) { w.m = true; toast('warn', 'One minute left. Start wrapping up.'); }
    if (discLeft <= 10 && discLeft > 0 && !w.s) { w.s = true; toast('error', '10 seconds left!'); }
  }, [discLeft, inDiscussion, state?.sessionId, toast]);

  // --- errors, phase changes, slow connection hints ---
  useEffect(() => { if (error && error.code !== 'ROOM_NOT_FOUND') { toast('error', error.message); rs.clearError(); } }, [error, toast, rs]);
  const prevPhase = useRef(null);
  useEffect(() => {
    if (!phase || prevPhase.current === phase) { prevPhase.current = phase; return; }
    if (phase === 'prep') toast('info', 'Topic announced. Prepare your thoughts - no speaking yet.');
    if (phase === 'discussion') toast('ok', 'Discussion started. Your microphone is being recorded.');
    if (phase === 'ended') toast('info', 'Discussion over. Generating your report...');
    prevPhase.current = phase;
  }, [phase, toast]);
  useEffect(() => {
    if (joined || !ready) return undefined;
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [joined, ready]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next); micRef.current = next;
    media.setEnabled('audio', next);
    emit('toggle-media', { mic: next });
  };
  const toggleVideo = () => {
    const next = !videoOn;
    setVideoOn(next);
    media.setEnabled('video', next);
    emit('toggle-media', { video: next });
  };
  const leave = () => navigate('/');

  // ----- blocking states -----
  if (!name) return null;
  if (error?.code === 'ROOM_NOT_FOUND') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Room not found</h1>
          <p className="text-gray-600 mb-4">{error.message}</p>
          <Link to="/join" className="text-blue-600 hover:underline">Try another code</Link>
        </div>
      </div>
    );
  }
  if (media.status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">We need your microphone</h1>
          <p className="text-gray-600 mb-5">{media.error}</p>
          <div className="flex flex-col gap-2">
            <button onClick={media.retry} className="bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Try again</button>
            <button onClick={media.skip} className="text-sm text-gray-600 hover:underline">Continue without a microphone (no report for you)</button>
          </div>
        </div>
      </div>
    );
  }
  if (media.status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-600">Requesting camera and microphone...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Toasts toasts={toasts} dismiss={dismiss} />
      <ConfirmModal
        open={confirm === 'end'}
        danger
        title="End the discussion now?"
        body="Everyone's recording stops and reports start generating."
        confirmLabel="End discussion"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { emit('end-discussion'); setConfirm(null); }}
      />
      <ConfirmModal
        open={confirm === 'leave'}
        danger
        title="Leave the room?"
        body={inDiscussion ? 'The discussion is still running. If you leave now your recording is discarded and you will not get a report.' : 'You can rejoin with the same room code.'}
        confirmLabel="Leave"
        onCancel={() => setConfirm(null)}
        onConfirm={leave}
      />

      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-gray-800">GD Room</h1>
            <button
              onClick={() => { navigator.clipboard?.writeText(roomId); toast('ok', 'Room code copied'); }}
              className="font-mono tracking-widest bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-gray-800"
              title="Click to copy the room code"
            >{roomId}</button>
          </div>
          <span className={`text-xs px-2 py-1 rounded ${rs.connected && joined ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {rs.connected && joined ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {!joined && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm">
            Connecting to the room{slow ? '. The server may be waking up (free hosting) - this can take up to a minute.' : '...'}
          </div>
        )}
        {media.status === 'skipped' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm">You joined without a microphone: you can watch, but nothing is recorded for you.</div>
        )}
        {rec.error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{rec.error}</div>}

        {state && (
          <PhasePanel
            state={state}
            offset={offset}
            isHost={isHost}
            hostName={hostName}
            onConfigure={(c) => emit('configure', c)}
            onStart={(customTopic) => emit('start-gd', { customTopic })}
            onEnd={() => (phase === 'discussion' ? setConfirm('end') : emit('end-discussion'))}
            onReset={() => emit('reset-round')}
          />
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <VideoGrid
              localStream={media.stream}
              self={self ? { ...self, name: self.name } : { name }}
              participants={participants}
              remoteStreams={remoteStreams}
              micOn={micOn}
              videoOn={videoOn && media.hasVideo}
              speakingSelf={speaking}
            />
          </div>
          <aside className="space-y-4">
            <div className="bg-white rounded-xl shadow p-4">
              <Controls micOn={micOn} videoOn={videoOn} hasVideo={media.hasVideo} onToggleMic={toggleMic} onToggleVideo={toggleVideo} onLeave={() => setConfirm('leave')} />
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Participants ({participants.length})</h3>
              <UserList users={participants} contributions={contributions} selfClientId={clientId} />
            </div>
            {(phase === 'discussion' || phase === 'ended') && (
              <div className="bg-white rounded-xl shadow p-4"><ContributionPie data={contributions} /></div>
            )}
          </aside>
        </div>

        {phase === 'ended' && state.sessionId && (
          <AnalysisReport
            key={state.sessionId}
            sessionId={state.sessionId}
            clientId={clientId}
            userName={self?.name || name}
            roomId={roomId}
            blob={rec.result?.blob}
            ext={rec.result?.ext}
            noRecording="No recording was captured on this device (you joined after the discussion or without a microphone), so only the group comparison is shown."
          />
        )}
      </main>
    </div>
  );
}
