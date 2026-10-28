import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { SERVER_URL, CONFIG_MISSING } from '../utils/config';
import { getSavedName, saveName } from '../utils/identity';

export default function JoinRoom() {
  const [params] = useSearchParams();
  const [roomId, setRoomId] = useState((params.get('room') || '').toUpperCase());
  const [userName, setUserName] = useState(getSavedName());
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoin = async () => {
    const code = roomId.trim().toUpperCase();
    const name = userName.trim();
    if (!code) return setMessage('Please enter the room code.');
    if (!name) return setMessage('Please enter your name.');
    if (CONFIG_MISSING) return setMessage('The app is not configured: VITE_SERVER_URL is missing on this deployment.');
    setLoading(true);
    setMessage('');
    try {
      const { data } = await axios.post(`${SERVER_URL}/api/rooms/join`, { passkey: code }, { timeout: 45000 });
      saveName(name);
      navigate(`/room/${data.room.passkey}`, { state: { name } });
    } catch (err) {
      console.error('Error joining room:', err);
      if (err.response?.status === 404) setMessage('Room not found. Please check the code and try again.');
      else if (!err.response) setMessage('Could not reach the server. It may be waking up - wait 30 seconds and try again.');
      else setMessage(err.response?.data?.message || 'Could not join the room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => e.key === 'Enter' && !loading && handleJoin();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center">Join a room</h1>
        <div className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">Room code</label>
            <input
              id="code"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              onKeyDown={onKey}
              placeholder="e.g. K7M3QX"
              className="w-full p-3 border border-gray-300 rounded-lg text-gray-800 tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="jname" className="block text-sm font-medium text-gray-700 mb-2">Your name</label>
            <input
              id="jname"
              type="text"
              value={userName}
              maxLength={40}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={onKey}
              placeholder="Enter your name"
              className="w-full p-3 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={loading}
            />
          </div>
          <button
            onClick={handleJoin}
            disabled={loading || !roomId.trim() || !userName.trim()}
            className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-purple-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Joining...' : 'Join room'}
          </button>
          <div className="text-center">
            <button onClick={() => navigate('/')} className="text-purple-600 hover:underline" disabled={loading}>Back to home</button>
          </div>
        </div>
        {message && <div role="alert" className="mt-4 p-3 rounded-lg text-center bg-red-100 text-red-700 text-sm">{message}</div>}
      </div>
    </div>
  );
}
