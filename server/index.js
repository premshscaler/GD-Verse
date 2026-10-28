require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./utils/config');
const dbConnect = require('./utils/dbConnect');
const roomRoutes = require('./routes/roomRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const socketHandler = require('./socketHandler');

const app = express();
const server = http.createServer(app);

const corsOrigin = (origin, cb) => cb(null, config.isOriginAllowed(origin));

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    assemblyKeyConfigured: !!config.assemblyKey,
    mongoConfigured: !!config.mongoUri,
    corsOrigins: config.clientOrigins.length,
  });
});

app.use('/api/rooms', roomRoutes);
app.use('/api/analysis', analysisRoutes);

app.use((req, res) => res.status(404).json({ message: 'Not found' }));

// One global error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({ message: 'Internal server error' });
});

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 1e6,
});
socketHandler(io);

server.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  if (!config.clientOrigins.length) console.warn('CLIENT_ORIGIN is not set: only localhost origins are allowed in development.');
  if (!config.assemblyKey) console.warn('ASSEMBLYAI_API_KEY is not set: reports will fail until it is.');
  // Connect at boot; requests retry the connection if this fails.
  dbConnect().catch((e) => console.error('MongoDB connection failed at boot:', e.message));
});

process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e && e.message));
