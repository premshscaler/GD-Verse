import { useParams, Link } from 'react-router-dom';
import AnalysisReport from '../components/AnalysisReport';
import { getClientId, getSavedName } from '../utils/identity';

// Re-open a stored report later: /report/:sessionId
export default function ReportPage() {
  const { sessionId } = useParams();
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Link to="/" className="text-blue-600 hover:underline text-sm">Back to home</Link>
        <AnalysisReport sessionId={sessionId} clientId={getClientId()} userName={getSavedName()} viewOnly />
      </div>
    </div>
  );
}
