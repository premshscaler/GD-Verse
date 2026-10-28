/**
 * Per-room state machine: LOBBY -> PREP -> DISCUSSION -> ENDED -> LOBBY.
 * The server is the single source of truth for phase, topic and timers.
 *
 * Everything that touches the outside world (socket.io, clock, timers, DB) is
 * injected so the whole thing can be unit-tested with fakes (see test/).
 */
const { randomUUID } = require('crypto');
const TOPICS = require('./topics');

const PREP_OPTIONS = [30, 60, 90];
const DISCUSSION_OPTIONS = [180, 300, 600, 900];
const RECONNECT_GRACE_MS = 10000;
const CONTRIBUTION_TICK_MS = 2000;

function createRoomManager({
  io,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  setTick = setInterval,
  clearTick = clearInterval,
  roomExists = async () => true,
  onSessionEnded = async () => {},
  graceMs = RECONNECT_GRACE_MS,
  topics = TOPICS,
  random = Math.random,
} = {}) {
  const rooms = new Map();

  // ---------- helpers ----------
  const cleanText = (n, max) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const cleanName = (n) => cleanText(n, 40);
  const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

  function newRoom(id) {
    return {
      id,
      phase: 'lobby',
      topic: null,
      lastTopic: null,
      sessionId: null,
      prepSec: 60,
      discussionSec: 300,
      prepEndsAt: null,
      discussionEndsAt: null,
      startedAt: null,
      discussionStartedAt: null,
      endedAt: null,
      endReason: null,
      round: 0,
      hostClientId: null,
      members: new Map(),
      prepTimer: null,
      discTimer: null,
      tick: null,
    };
  }

  function uniqueName(room, clientId, wanted) {
    const base = cleanName(wanted) || 'Anonymous';
    const taken = new Set([...room.members.values()].filter((m) => m.clientId !== clientId).map((m) => m.name));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 100; i++) {
      const c = `${base} (${i})`;
      if (!taken.has(c)) return c;
    }
    return base;
  }

  function liveSpeakingMs(m) {
    return m.speakingMs + (m.speaking && m.speakStart ? Math.max(0, now() - m.speakStart) : 0);
  }

  function publicState(room) {
    return {
      phase: room.phase,
      topic: room.topic,
      sessionId: room.sessionId,
      prepEndsAt: room.prepEndsAt,
      discussionEndsAt: room.discussionEndsAt,
      prepSec: room.prepSec,
      discussionSec: room.discussionSec,
      hostClientId: room.hostClientId,
      round: room.round,
      endReason: room.endReason,
      serverNow: now(),
    };
  }

  const participantsList = (room) =>
    [...room.members.values()].map((m) => ({
      clientId: m.clientId,
      socketId: m.socketId,
      name: m.name,
      mic: m.mic,
      video: m.video,
      speaking: m.speaking,
      connected: m.connected,
      isHost: m.clientId === room.hostClientId,
    }));

  function contributions(room) {
    const rows = [...room.members.values()].map((m) => ({
      clientId: m.clientId,
      name: m.name,
      speakingMs: liveSpeakingMs(m),
      speaking: m.speaking,
      turns: m.turns,
      interruptions: m.interruptions,
    }));
    const total = rows.reduce((s, r) => s + r.speakingMs, 0);
    return rows.map((r) => ({ ...r, percent: total ? Math.round((r.speakingMs / total) * 100) : 0 }));
  }

  const emitState = (room) => io.to(room.id).emit('room-state', publicState(room));
  const emitParticipants = (room) => io.to(room.id).emit('participants', participantsList(room));
  const emitContrib = (room) => io.to(room.id).emit('contribution-update', contributions(room));

  function pickHost(room) {
    const candidates = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const next = candidates.find((m) => m.connected) || candidates[0];
    room.hostClientId = next ? next.clientId : null;
  }

  function stopSpeaking(m) {
    if (!m.speaking) return;
    m.speakingMs += Math.max(0, now() - (m.speakStart || now()));
    m.speaking = false;
    m.speakStart = null;
  }

  function clearTimers(room) {
    if (room.prepTimer) clearTimer(room.prepTimer);
    if (room.discTimer) clearTimer(room.discTimer);
    if (room.tick) clearTick(room.tick);
    room.prepTimer = room.discTimer = room.tick = null;
  }

  function destroyRoom(room) {
    clearTimers(room);
    for (const m of room.members.values()) if (m.graceTimer) clearTimer(m.graceTimer);
    rooms.delete(room.id);
  }

  function removeMember(room, clientId) {
    const m = room.members.get(clientId);
    if (!m) return;
    if (m.graceTimer) clearTimer(m.graceTimer);
    stopSpeaking(m);
    room.members.delete(clientId);
    if (room.members.size === 0) return destroyRoom(room);
    if (room.hostClientId === clientId) pickHost(room);
    emitParticipants(room);
    emitContrib(room);
    emitState(room);
  }

  // ---------- phase transitions ----------
  function startPrep(room, customTopic) {
    let topic = cleanText(customTopic, 200);
    if (!topic) {
      const pool = topics.filter((t) => t !== room.lastTopic);
      topic = pool[Math.floor(random() * pool.length)] || topics[0];
    }
    room.round += 1;
    room.topic = topic;
    room.lastTopic = topic;
    room.sessionId = randomUUID();
    room.phase = 'prep';
    room.startedAt = now();
    room.prepEndsAt = now() + room.prepSec * 1000;
    room.discussionEndsAt = null;
    room.endReason = null;
    for (const m of room.members.values()) {
      m.speakingMs = 0; m.turns = 0; m.interruptions = 0; m.speaking = false; m.speakStart = null;
    }
    room.prepTimer = setTimer(() => startDiscussion(room), room.prepSec * 1000);
    emitState(room);
    emitParticipants(room);
    emitContrib(room);
  }

  function startDiscussion(room) {
    if (room.phase !== 'prep') return;
    room.prepTimer = null;
    room.phase = 'discussion';
    room.discussionStartedAt = now();
    room.discussionEndsAt = now() + room.discussionSec * 1000;
    room.discTimer = setTimer(() => endDiscussion(room, 'timer'), room.discussionSec * 1000);
    room.tick = setTick(() => emitContrib(room), CONTRIBUTION_TICK_MS);
    emitState(room);
  }

  function endDiscussion(room, reason) {
    if (room.phase !== 'discussion') return;
    clearTimers(room);
    for (const m of room.members.values()) stopSpeaking(m);
    room.phase = 'ended';
    room.endedAt = now();
    room.endReason = reason;
    emitState(room);
    emitParticipants(room);
    emitContrib(room);
    const snapshot = {
      sessionId: room.sessionId,
      roomId: room.id,
      topic: room.topic,
      prepSec: room.prepSec,
      discussionSec: room.discussionSec,
      startedAt: new Date(room.startedAt),
      discussionStartedAt: new Date(room.discussionStartedAt),
      endedAt: new Date(room.endedAt),
      endReason: reason,
      participants: [...room.members.values()].map((m) => ({
        clientId: m.clientId, name: m.name, speakingMs: m.speakingMs, turns: m.turns, interruptions: m.interruptions,
      })),
    };
    Promise.resolve(onSessionEnded(snapshot)).catch((e) => console.error('Failed to persist session:', e.message));
  }

  function cancelPrep(room) {
    clearTimers(room);
    room.phase = 'lobby';
    room.topic = null;
    room.sessionId = null;
    room.prepEndsAt = null;
    emitState(room);
  }

  function resetRound(room) {
    clearTimers(room);
    room.phase = 'lobby';
    room.topic = null;
    room.sessionId = null;
    room.prepEndsAt = room.discussionEndsAt = null;
    room.endReason = null;
    for (const m of room.members.values()) {
      m.speakingMs = 0; m.turns = 0; m.interruptions = 0; m.speaking = false; m.speakStart = null;
    }
    emitState(room);
    emitContrib(room);
  }

  // ---------- socket wiring ----------
  function handleConnection(socket) {
    socket.data = socket.data || {};

    const ctx = () => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return {};
      const member = room.members.get(socket.data.clientId);
      if (!member || member.socketId !== socket.id) return {}; // stale socket
      return { room, member };
    };
    const sendError = (code, message) => socket.emit('error', { code, message });
    const hostOnly = (room, member) => {
      if (member.clientId !== room.hostClientId) { sendError('NOT_HOST', 'Only the host can do that.'); return false; }
      return true;
    };

    socket.on('join-room', async (payload = {}) => {
      const { roomId, clientId } = payload;
      const name = cleanName(payload.name);
      if (!isStr(roomId, 32) || !isStr(clientId, 64) || !name) {
        return sendError('BAD_REQUEST', 'Room code, name and client id are required.');
      }
      try {
        if (!rooms.has(roomId) && !(await roomExists(roomId))) {
          return sendError('ROOM_NOT_FOUND', 'That room does not exist. Check the code and try again.');
        }
      } catch (e) {
        console.error('roomExists failed:', e.message);
        return sendError('SERVER_ERROR', 'Could not verify the room. Please try again in a moment.');
      }
      if (!socket.connected && socket.connected !== undefined) return; // dropped while awaiting

      const room = rooms.get(roomId) || (rooms.set(roomId, newRoom(roomId)), rooms.get(roomId));

      let member = room.members.get(clientId);
      if (member) {
        // Reconnect / reload: same person, new socket.
        if (member.graceTimer) { clearTimer(member.graceTimer); member.graceTimer = null; }
        if (member.socketId && member.socketId !== socket.id) {
          io.to(room.id).emit('peer-left', { socketId: member.socketId });
        }
        member.socketId = socket.id;
        member.connected = true;
        member.name = uniqueName(room, clientId, name);
      } else {
        member = {
          clientId, socketId: socket.id, name: uniqueName(room, clientId, name),
          mic: true, video: true, connected: true, joinedAt: now(),
          speaking: false, speakStart: null, speakingMs: 0, turns: 0, interruptions: 0, graceTimer: null,
        };
        room.members.set(clientId, member);
      }
      if (!room.hostClientId || !room.members.get(room.hostClientId)) pickHost(room);

      socket.data.roomId = roomId;
      socket.data.clientId = clientId;
      socket.join(roomId);

      const peers = participantsList(room)
        .filter((p) => p.clientId !== clientId && p.connected)
        .map(({ socketId, clientId: cid, name: n, mic, video }) => ({ socketId, clientId: cid, name: n, mic, video }));

      socket.emit('joined', {
        self: { clientId, socketId: socket.id, name: member.name, isHost: room.hostClientId === clientId },
        peers,
        state: publicState(room),
      });
      emitParticipants(room);
      emitContrib(room);
      emitState(room);
    });

    socket.on('toggle-media', (p = {}) => {
      const { room, member } = ctx();
      if (!room) return;
      if (typeof p.mic === 'boolean') {
        member.mic = p.mic;
        if (!p.mic) { stopSpeaking(member); emitContrib(room); }
      }
      if (typeof p.video === 'boolean') member.video = p.video;
      emitParticipants(room);
    });

    socket.on('start-speaking', () => {
      const { room, member } = ctx();
      if (!room || room.phase !== 'discussion' || member.speaking || !member.mic) return;
      const someoneElse = [...room.members.values()].some((m) => m !== member && m.speaking);
      if (someoneElse) member.interruptions += 1;
      member.turns += 1;
      member.speaking = true;
      member.speakStart = now();
      emitParticipants(room);
    });

    socket.on('stop-speaking', () => {
      const { room, member } = ctx();
      if (!room || !member.speaking) return;
      stopSpeaking(member);
      emitParticipants(room);
      emitContrib(room);
    });

    socket.on('configure', (p = {}) => {
      const { room, member } = ctx();
      if (!room || !hostOnly(room, member)) return;
      if (room.phase !== 'lobby') return sendError('BAD_PHASE', 'Settings can only be changed in the lobby.');
      if (PREP_OPTIONS.includes(p.prepSec)) room.prepSec = p.prepSec;
      if (DISCUSSION_OPTIONS.includes(p.discussionSec)) room.discussionSec = p.discussionSec;
      emitState(room);
    });

    socket.on('start-gd', (p = {}) => {
      const { room, member } = ctx();
      if (!room || !hostOnly(room, member)) return;
      if (room.phase !== 'lobby') return sendError('BAD_PHASE', 'A round is already in progress.');
      startPrep(room, p.customTopic);
    });

    socket.on('end-discussion', () => {
      const { room, member } = ctx();
      if (!room || !hostOnly(room, member)) return;
      if (room.phase === 'discussion') endDiscussion(room, 'host');
      else if (room.phase === 'prep') cancelPrep(room);
    });

    socket.on('reset-round', () => {
      const { room, member } = ctx();
      if (!room || !hostOnly(room, member)) return;
      if (room.phase !== 'ended') return sendError('BAD_PHASE', 'You can start a new round after the discussion ends.');
      resetRound(room);
    });

    // WebRTC signalling is routed by socket id and only inside the same room.
    for (const evt of ['offer', 'answer', 'ice-candidate']) {
      socket.on(evt, (p = {}) => {
        const { room } = ctx();
        if (!room || typeof p.to !== 'string') return;
        const target = [...room.members.values()].find((m) => m.socketId === p.to && m.connected);
        if (!target) return;
        const { to, ...rest } = p;
        io.to(to).emit(evt, { from: socket.id, ...rest });
      });
    }

    socket.on('leave-room', () => {
      const { room, member } = ctx();
      if (!room) return;
      const sid = member.socketId;
      socket.leave(room.id);
      socket.data.roomId = null;
      io.to(room.id).emit('peer-left', { socketId: sid });
      removeMember(room, member.clientId);
    });

    socket.on('disconnect', () => {
      const { room, member } = ctx();
      if (!room) return;
      member.connected = false;
      stopSpeaking(member);
      io.to(room.id).emit('peer-left', { socketId: member.socketId });
      emitParticipants(room);
      emitContrib(room);
      // Give a reloading tab a few seconds to come back as the same person.
      member.graceTimer = setTimer(() => {
        const cur = rooms.get(room.id);
        const m = cur && cur.members.get(member.clientId);
        if (m && !m.connected) removeMember(cur, m.clientId);
      }, graceMs);
    });
  }

  return { handleConnection, rooms, _internals: { endDiscussion, publicState, contributions }, PREP_OPTIONS, DISCUSSION_OPTIONS };
}

module.exports = { createRoomManager, PREP_OPTIONS, DISCUSSION_OPTIONS };
