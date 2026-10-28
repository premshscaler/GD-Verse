import { useCallback, useEffect, useRef, useState } from 'react';
import socket from '../utils/socket';

/**
 * Owns the socket lifecycle for a room. Re-joins automatically after every (re)connect and keeps
 * a clock offset (serverNow - clientNow) so all devices render the same countdown.
 */
export default function useRoomSocket({ roomId, clientId, name, ready }) {
  const [connected, setConnected] = useState(socket.connected);
  const [joined, setJoined] = useState(null); // { self, peers, state } of the latest join
  const [participants, setParticipants] = useState([]);
  const [state, setState] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null); // { code, message }
  const [joinCount, setJoinCount] = useState(0);
  const fatal = useRef(false);

  const syncClock = useCallback((serverNow) => {
    if (typeof serverNow === 'number') setOffset(serverNow - Date.now());
  }, []);

  useEffect(() => {
    if (!ready || !roomId || !name) return undefined;
    fatal.current = false;

    const join = () => socket.emit('join-room', { roomId, clientId, name });
    const onConnect = () => { setConnected(true); join(); };
    const onDisconnect = () => setConnected(false);
    const onJoined = (p) => { setError(null); setJoined(p); setState(p.state); syncClock(p.state.serverNow); setJoinCount((c) => c + 1); };
    const onState = (s) => { setState(s); syncClock(s.serverNow); };
    const onError = (e) => {
      if (['ROOM_NOT_FOUND', 'BAD_REQUEST'].includes(e.code)) fatal.current = true;
      setError(e);
    };
    const onConnectError = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('joined', onJoined);
    socket.on('participants', setParticipants);
    socket.on('room-state', onState);
    socket.on('contribution-update', setContributions);
    socket.on('error', onError);

    if (socket.connected) onConnect(); else socket.connect();

    return () => {
      socket.emit('leave-room');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('joined', onJoined);
      socket.off('participants', setParticipants);
      socket.off('room-state', onState);
      socket.off('contribution-update', setContributions);
      socket.off('error', onError);
      socket.disconnect();
    };
  }, [ready, roomId, clientId, name, syncClock]);

  const emit = useCallback((event, payload) => socket.emit(event, payload), []);
  const clearError = useCallback(() => setError(null), []);

  return { socket, connected, joined, joinCount, participants, state, contributions, offset, error, clearError, emit };
}
