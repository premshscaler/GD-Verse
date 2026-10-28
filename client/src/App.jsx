import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './components/HomePage';
import JoinRoom from './components/JoinRoom';
import RoomDashboard from './pages/RoomDashboard';
import ReportPage from './pages/ReportPage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/room/:id" element={<RoomDashboard />} />
        <Route path="/report/:sessionId" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
