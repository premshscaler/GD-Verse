import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { SERVER_URL, CONFIG_MISSING } from '../utils/config';
import { getSavedName, saveName } from '../utils/identity';

export default function HomePage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState(getSavedName());
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    const name = userName.trim();
    if (!name) return setMessage('Please enter your name before creating a room.');
    if (CONFIG_MISSING) return setMessage('The app is not configured: VITE_SERVER_URL is missing on this deployment.');
    setLoading(true);
    setMessage('');
    try {
      const { data } = await axios.post(`${SERVER_URL}/api/rooms/create`, null, { timeout: 45000 });
      saveName(name);
      navigate(`/room/${data.passkey}`, { state: { name } });
    } catch (err) {
      console.error('Error creating room:', err);
      setMessage(
        err.code === 'ECONNABORTED' || !err.response
          ? 'Could not reach the server. It may be waking up (free hosting) - wait 30 seconds and try again.'
          : err.response?.data?.message || 'Could not create the room. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2 text-gray-800 text-center">GD Practice Room</h1>
        <p className="text-center text-gray-500 mb-6 text-sm">Practise group discussions and get an AI report on how you did.</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">Your name</label>
            <input
              id="name"
              type="text"
              value={userName}
              maxLength={40}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleCreateRoom()}
              placeholder="Enter your name"
              className="w-full p-3 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <button
            onClick={handleCreateRoom}
            disabled={loading || !userName.trim()}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating room...' : 'Create a room'}
          </button>

          <div className="text-center text-gray-500">or</div>

          <button
            onClick={() => navigate('/join')}
            disabled={loading}
            className="w-full bg-white text-blue-600 py-3 px-4 rounded-lg font-semibold border-2 border-blue-600 hover:bg-blue-50 transition"
          >
            Join a room
          </button>
        </div>

        {message && <div role="alert" className="mt-4 p-3 rounded-lg text-center bg-red-100 text-red-700 text-sm">{message}</div>}
      </div>
    </div>
  );
}
