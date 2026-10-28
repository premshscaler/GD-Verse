const test = require('node:test');
const assert = require('node:assert');
const { createRoomManager } = require('../lib/roomManager');

// ---- fakes ----
function makeEnv(opts = {}) {
  let t = 1_000_000;
  const timers = [];
  const emitted = []; // {target, event, payload}
  const sockets = new Map();
  const io = {
    to: (target) => ({ emit: (event, payload) => {
      emitted.push({ target, event, payload });
      const direct = sockets.get(target);
      if (direct) direct.received.push({ event, payload });
      else for (const s of sockets.values()) if (s.rooms.has(target)) s.received.push({ event, payload });
    } }),
  };
  const ended = [];
  const mgr = createRoomManager({
    io,
    now: () => t,
    setTimer: (fn, ms) => { const h = { fn, at: t + ms, done: false }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.done = true; },
    setTick: (fn, ms) => { const h = { fn, at: t + ms, every: ms, done: false }; timers.push(h); return h; },
    clearTick: (h) => { if (h) h.done = true; },
    roomExists: opts.roomExists || (async () => true),
    onSessionEnded: async (s) => { ended.push(s); },
    graceMs: 10000,
    random: () => 0,
    topics: ['A', 'B', 'C'],
  });
  const advance = (ms) => {
    const target = t + ms;
    for (;;) {
      const due = timers.filter((h) => !h.done && h.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = due.at;
      if (due.every) due.at += due.every; else due.done = true;
      due.fn();
    }
    t = target;
  };
  function connect(id) {
    const handlers = {};
    const s = {
      id, data: {}, received: [], rooms: new Set(), connected: true,
      on: (e, fn) => { handlers[e] = fn; },
      emit: (event, payload) => s.received.push({ event, payload }),
      join: (r) => s.rooms.add(r), leave: (r) => s.rooms.delete(r),
      trigger: async (e, p) => handlers[e] && handlers[e](p),
      last: (event) => [...s.received].reverse().find((m) => m.event === event)?.payload,
    };
    sockets.set(id, s);
    mgr.handleConnection(s);
    return s;
  }
  return { mgr, connect, advance, emitted, ended, now: () => t };
}

async function join(env, id, clientId, name, roomId = 'ROOM1') {
  const s = env.connect(id);
  await s.trigger('join-room', { roomId, clientId, name });
  return s;
}

test('first joiner is host; unknown room is rejected', async () => {
  const env = makeEnv({ roomExists: async (r) => r === 'ROOM1' });
  const a = await join(env, 's1', 'c1', 'Asha');
  assert.equal(a.last('joined').self.isHost, true);
  const bad = env.connect('sx');
  await bad.trigger('join-room', { roomId: 'NOPE', clientId: 'cx', name: 'X' });
  assert.equal(bad.last('error').code, 'ROOM_NOT_FOUND');
});

test('only host can configure/start; start only once', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  const b = await join(env, 's2', 'c2', 'Ben');
  await b.trigger('start-gd', {});
  assert.equal(b.last('error').code, 'NOT_HOST');
  await a.trigger('configure', { prepSec: 30, discussionSec: 180 });
  assert.equal(a.last('room-state').prepSec, 30);
  await a.trigger('start-gd', {});
  assert.equal(a.last('room-state').phase, 'prep');
  await a.trigger('start-gd', {});
  assert.equal(a.last('error').code, 'BAD_PHASE');
  await a.trigger('configure', { prepSec: 90 }); // locked outside lobby
  assert.equal(a.last('error').code, 'BAD_PHASE');
});

test('full flow lobby -> prep -> discussion -> ended with server timers', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  await a.trigger('configure', { prepSec: 30, discussionSec: 180 });
  await a.trigger('start-gd', {});
  const prep = a.last('room-state');
  assert.equal(prep.topic, 'A');
  assert.equal(prep.prepEndsAt - prep.serverNow, 30000);
  env.advance(29000);
  assert.equal(a.last('room-state').phase, 'prep');
  env.advance(1500);
  const disc = a.last('room-state');
  assert.equal(disc.phase, 'discussion');
  assert.equal(disc.discussionEndsAt - env.now() > 170000, true);
  env.advance(180000);
  assert.equal(a.last('room-state').phase, 'ended');
  assert.equal(a.last('room-state').endReason, 'timer');
  assert.equal(env.ended.length, 1);
  assert.equal(env.ended[0].participants[0].name, 'Asha');
  await a.trigger('reset-round');
  assert.equal(a.last('room-state').phase, 'lobby');
});

test('topic never repeats the previous round; custom topic wins', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  await a.trigger('configure', { prepSec: 30, discussionSec: 180 });
  await a.trigger('start-gd', {});
  assert.equal(a.last('room-state').topic, 'A');
  await a.trigger('end-discussion'); // cancels prep -> lobby
  assert.equal(a.last('room-state').phase, 'lobby');
  await a.trigger('start-gd', {});
  assert.notEqual(a.last('room-state').topic, 'A');
  await a.trigger('end-discussion');
  await a.trigger('start-gd', { customTopic: '  My   custom topic ' });
  assert.equal(a.last('room-state').topic, 'My custom topic');
});

test('host can end discussion early; timers are cleared', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  await a.trigger('configure', { prepSec: 30, discussionSec: 180 });
  await a.trigger('start-gd', {});
  env.advance(30000);
  env.advance(5000);
  await a.trigger('end-discussion');
  assert.equal(a.last('room-state').phase, 'ended');
  assert.equal(a.last('room-state').endReason, 'host');
  env.advance(400000);
  assert.equal(env.ended.length, 1); // timer did not end it a second time
});

test('speaking time accrues only in discussion; muted users accrue none; interruptions counted', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  const b = await join(env, 's2', 'c2', 'Ben');
  await a.trigger('configure', { prepSec: 30, discussionSec: 180 });
  await a.trigger('start-gd', {});
  await a.trigger('start-speaking'); // during prep: ignored
  env.advance(5000);
  await a.trigger('stop-speaking');
  env.advance(25000); // prep ends
  assert.equal(a.last('contribution-update').find((r) => r.clientId === 'c1').speakingMs, 0);

  await a.trigger('start-speaking');
  env.advance(4000);
  await b.trigger('start-speaking'); // Ben starts while Asha speaks => interruption
  env.advance(2000);
  await a.trigger('stop-speaking');
  env.advance(3000);
  await b.trigger('toggle-media', { mic: false }); // muting stops accrual
  env.advance(10000);
  await env.mgr._internals.endDiscussion(env.mgr.rooms.get('ROOM1'), 'host');
  const rows = a.last('contribution-update');
  const A = rows.find((r) => r.clientId === 'c1');
  const B = rows.find((r) => r.clientId === 'c2');
  assert.equal(A.speakingMs, 6000);
  assert.equal(B.speakingMs, 5000);
  assert.equal(B.interruptions, 1);
  assert.equal(A.interruptions, 0);
  assert.equal(A.percent + B.percent >= 99, true);
});

test('duplicate names are disambiguated; identity is by clientId', async () => {
  const env = makeEnv();
  await join(env, 's1', 'c1', 'Sam');
  const b = await join(env, 's2', 'c2', 'Sam');
  assert.equal(b.last('joined').self.name, 'Sam (2)');
});

test('reload within grace keeps identity and host; peers are told to drop the old socket', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  const b = await join(env, 's2', 'c2', 'Ben');
  await a.trigger('disconnect');
  assert.equal(b.last('peer-left').socketId, 's1');
  env.advance(3000);
  const a2 = await join(env, 's3', 'c1', 'Asha');
  assert.equal(a2.last('joined').self.isHost, true);
  assert.equal(a2.last('joined').peers.length, 1);
  env.advance(20000); // the old grace timer must not remove her
  assert.equal(env.mgr.rooms.get('ROOM1').members.size, 2);
  // stale socket events are ignored
  await a.trigger('toggle-media', { mic: false });
  assert.equal(env.mgr.rooms.get('ROOM1').members.get('c1').mic, true);
});

test('host handover to longest-present participant after grace; room deleted when empty', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  env.advance(1000);
  const b = await join(env, 's2', 'c2', 'Ben');
  env.advance(1000);
  await join(env, 's3', 'c3', 'Cy');
  await a.trigger('leave-room');
  assert.equal(b.last('room-state').hostClientId, 'c2');
  await b.trigger('disconnect');
  env.advance(11000);
  assert.equal(env.mgr.rooms.get('ROOM1').hostClientId, 'c3');
  const c = env.connect('x'); // unrelated
  void c;
});

test('everyone leaving mid-discussion clears timers and deletes room state', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  await a.trigger('configure', { prepSec: 30, discussionSec: 180 });
  await a.trigger('start-gd', {});
  env.advance(31000);
  await a.trigger('leave-room');
  assert.equal(env.mgr.rooms.size, 0);
  env.advance(500000);
  assert.equal(env.ended.length, 0);
});

test('late joiner during discussion gets a snapshot with correct deadline; signalling is room-scoped', async () => {
  const env = makeEnv();
  const a = await join(env, 's1', 'c1', 'Asha');
  await a.trigger('configure', { prepSec: 30, discussionSec: 180 });
  await a.trigger('start-gd', {});
  env.advance(60000);
  const b = await join(env, 's2', 'c2', 'Ben');
  const st = b.last('joined').state;
  assert.equal(st.phase, 'discussion');
  assert.equal(st.discussionEndsAt - st.serverNow, 150000);
  await b.trigger('offer', { to: 's1', offer: { sdp: 'x' } });
  assert.equal(a.last('offer').from, 's2');
  await b.trigger('offer', { to: 'stranger', offer: {} });
  assert.equal(env.emitted.filter((e) => e.target === 'stranger').length, 0);
});
