const { createRoomManager } = require('./lib/roomManager');
const Room = require('./models/Room');
const Session = require('./models/Session');
const dbConnect = require('./utils/dbConnect');

module.exports = function socketHandler(io) {
  const manager = createRoomManager({
    io,
    roomExists: async (roomId) => {
      await dbConnect();
      return !!(await Room.exists({ passkey: roomId }));
    },
    onSessionEnded: async (snapshot) => {
      await dbConnect();
      await Session.updateOne({ sessionId: snapshot.sessionId }, { $set: snapshot }, { upsert: true });
    },
  });
  io.on('connection', (socket) => manager.handleConnection(socket));
  return manager;
};
