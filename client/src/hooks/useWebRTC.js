import { useEffect, useRef, useState } from 'react';
import { ICE_SERVERS } from '../utils/config';

/**
 * Mesh WebRTC. Rules that avoid the old flakiness:
 *  - the NEW joiner is the only initiator toward existing peers (no glare, one connection per pair)
 *  - ICE candidates that arrive before the remote description are queued, then flushed
 *  - local tracks are attached once, when the connection is created
 *  - peers are keyed by socket id and torn down on `peer-left` or when we re-join
 * Returns Map<socketId, MediaStream>.
 */
export default function useWebRTC({ socket, localStream, joined, joinCount }) {
  const [remote, setRemote] = useState(new Map());
  const peers = useRef(new Map()); // socketId -> { pc, queue: [], hasRemote }
  const localRef = useRef(localStream);
  localRef.current = localStream;

  const closePeer = (id) => {
    const p = peers.current.get(id);
    if (!p) return;
    p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null;
    try { p.pc.close(); } catch { /* ignore */ }
    peers.current.delete(id);
    setRemote((m) => { if (!m.has(id)) return m; const n = new Map(m); n.delete(id); return n; });
  };

  const closeAll = () => [...peers.current.keys()].forEach(closePeer);

  const createPeer = (id) => {
    closePeer(id);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const entry = { pc, queue: [], hasRemote: false };
    peers.current.set(id, entry);

    const stream = localRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    if (!stream || !stream.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
    if (!stream || !stream.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });

    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('ice-candidate', { to: id, candidate: e.candidate }); };
    pc.ontrack = (e) => {
      const s = e.streams[0] || new MediaStream([e.track]);
      setRemote((m) => { const n = new Map(m); n.set(id, s); return n; });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch { /* ignore */ } }
    };
    return entry;
  };

  const flush = async (entry) => {
    entry.hasRemote = true;
    for (const c of entry.queue.splice(0)) {
      try { await entry.pc.addIceCandidate(c); } catch { /* stale candidate */ }
    }
  };

  // Signalling listeners (registered once per socket).
  useEffect(() => {
    const onOffer = async ({ from, offer }) => {
      try {
        const entry = createPeer(from);
        await entry.pc.setRemoteDescription(offer);
        await flush(entry);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer: entry.pc.localDescription });
      } catch (e) { console.warn('offer handling failed', e); }
    };
    const onAnswer = async ({ from, answer }) => {
      const entry = peers.current.get(from);
      if (!entry || entry.pc.signalingState !== 'have-local-offer') return;
      try { await entry.pc.setRemoteDescription(answer); await flush(entry); } catch (e) { console.warn('answer failed', e); }
    };
    const onIce = async ({ from, candidate }) => {
      const entry = peers.current.get(from);
      if (!entry || !candidate) return;
      if (!entry.hasRemote) { entry.queue.push(candidate); return; }
      try { await entry.pc.addIceCandidate(candidate); } catch { /* ignore */ }
    };
    const onLeft = ({ socketId }) => closePeer(socketId);

    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('ice-candidate', onIce);
    socket.on('peer-left', onLeft);
    return () => {
      socket.off('offer', onOffer);
      socket.off('answer', onAnswer);
      socket.off('ice-candidate', onIce);
      socket.off('peer-left', onLeft);
      closeAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Every successful (re)join: rebuild connections, offering to everyone already in the room.
  useEffect(() => {
    if (!joined) return;
    closeAll();
    (async () => {
      for (const peer of joined.peers) {
        try {
          const entry = createPeer(peer.socketId);
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          socket.emit('offer', { to: peer.socketId, offer: entry.pc.localDescription });
        } catch (e) { console.warn('offer creation failed', e); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCount]);

  return remote;
}
