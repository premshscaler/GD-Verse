# GD-APP - AI Group Discussion Simulator

Practise group discussions with friends over video, then get a personal AI report (score, pace, clarity,
filler words, tone, speaking share) plus a group comparison. MERN + Socket.io + WebRTC + AssemblyAI.

## Flow (the server is the single source of truth)

`Lobby -> Prep (topic + countdown) -> Discussion (countdown, recording) -> Ended -> Reports -> New round`

* First person in the room is the host. Only the host configures (prep 30/60/90 s, discussion 3/5/10/15 min),
  starts, ends and resets. If the host leaves, the longest-present participant takes over.
* The server picks the topic once (never the same as the last round, or the host's custom topic) and owns the
  prep and discussion timers. Clients render `ceil((endsAt - now) / 1000)` using a server clock offset, so every
  device shows the same time and late joiners / reloads re-sync from the room snapshot.
* Each learner records only their own microphone, during the Discussion phase only. Speaking time, turns and
  interruptions come from voice-activity detection (no button to press); muted time is not counted.
* After the end, each device uploads its own audio automatically. The server transcribes it with AssemblyAI in a
  background job, stores the report in MongoDB, and the client polls for progress.

## Run locally

```bash
# server
cd server && cp .env.example .env     # fill MONGO_URI and ASSEMBLYAI_API_KEY
npm install && npm run dev            # http://localhost:5000

# client (second terminal)
cd client && cp .env.example .env
npm install && npm run dev            # http://localhost:5173
```

Open two browser windows (use a normal and a private window, or two profiles), create a room in one and join with
the 6-character code in the other. Camera/mic need `https` or `localhost`.

## Environment variables

| Where | Variable | Notes |
|---|---|---|
| Server | `MONGO_URI` | also accepts `MONGODB_URI`, `MONGO_URL` |
| Server | `ASSEMBLYAI_API_KEY` | also accepts `ASSEMBLY_API_KEY`, `Assembly_API_KEY` |
| Server | `CLIENT_ORIGIN` | frontend URL(s), comma separated, no trailing slash (also `FRONTEND_URL`) |
| Server | `PORT` | default 5000 |
| Server (optional) | `ASSEMBLYAI_SPEECH_MODELS` | comma list, only if AssemblyAI asks for an explicit model on your account |
| Client | `VITE_SERVER_URL` | backend URL, no trailing slash. Must be set at build time on Netlify/Vercel |
| Client (optional) | `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | TURN server for strict networks |

`GET /api/health` shows whether the key, database and CORS origins are configured (never the values).

## Deploy

* **Backend (Render)**: root `server`, build `npm install`, start `npm start`; set the server variables above.
* **Frontend (Netlify/Vercel)**: root `client`, build `npm run build`, publish `dist`; set `VITE_SERVER_URL` and redeploy.
  `client/public/_redirects` already handles SPA routing on Netlify.

## API

* `POST /api/rooms/create`, `POST /api/rooms/join {passkey}`
* `POST /api/analysis/upload` (multipart: `audio`, `roomId`, `sessionId`, `clientId`, `userName`) -> `202 {reportId}`
* `GET /api/analysis/result/:sessionId/:clientId` - status, progress, personal report
* `GET /api/analysis/session/:sessionId` - ranked group report
* `GET /api/analysis/download/:sessionId/:clientId` - PDF built from the stored report
* Stored reports can be reopened at `/report/:sessionId`.

## Socket contract

Client -> server: `join-room {roomId, clientId, name}`, `toggle-media {mic, video}`, `start-speaking`,
`stop-speaking`, `configure {prepSec, discussionSec}`, `start-gd {customTopic?}`, `end-discussion`, `reset-round`,
`leave-room`, `offer/answer/ice-candidate {to, ...}`.

Server -> client: `joined {self, peers, state}`, `participants [...]`, `room-state {phase, topic, sessionId,
prepEndsAt, discussionEndsAt, prepSec, discussionSec, hostClientId, serverNow}`, `contribution-update [...]`,
`peer-left {socketId}`, `offer/answer/ice-candidate {from, ...}`, `error {code, message}`.

## Tests

`cd server && npm test` runs the room state-machine tests (fake io and sockets: phases, timers, host handover,
duplicate names, reconnect, interruption counting) and the analysis-maths tests (synthetic AssemblyAI payloads).

## Known limits

Render's free tier sleeps (first request is slow; sockets reconnect and re-sync). WebRTC mesh suits about 6 people;
add a TURN server for strict networks. Interruption count is approximate. Out of scope: accounts, LLM-written
feedback, recording playback, SFU for large rooms.
