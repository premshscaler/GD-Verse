const { customAlphabet } = require('nanoid');
const Room = require('../models/Room');
const dbConnect = require('../utils/dbConnect');

// Unambiguous characters (no 0/O/1/I/l) so codes are easy to read out loud.
const makeKey = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6);

exports.createRoom = async (req, res) => {
  try {
    await dbConnect();
    for (let i = 0; i < 5; i++) {
      const passkey = makeKey();
      try {
        await Room.create({ passkey });
        return res.status(201).json({ message: 'Room created', passkey });
      } catch (e) {
        if (e.code !== 11000) throw e; // duplicate key -> try again
      }
    }
    res.status(500).json({ message: 'Could not allocate a room code. Please try again.' });
  } catch (err) {
    console.error('Create room error:', err.message);
    res.status(500).json({ message: 'Failed to create room. Is the database reachable?' });
  }
};

exports.joinRoom = async (req, res) => {
  try {
    const raw = String((req.body && req.body.passkey) || '').trim();
    if (!raw) return res.status(400).json({ message: 'Room code is required.' });
    await dbConnect();
    // New codes are upper-case; also match rooms created before that change.
    const room = await Room.findOne({ passkey: { $in: [raw, raw.toUpperCase()] } }).lean();
    if (!room) return res.status(404).json({ message: 'Room not found. Please check the code.' });
    res.json({ message: 'Room found', room: { passkey: room.passkey } });
  } catch (err) {
    console.error('Join room error:', err.message);
    res.status(500).json({ message: 'Failed to join room.' });
  }
};
