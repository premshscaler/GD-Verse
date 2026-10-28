export default function Controls({ micOn, videoOn, hasVideo, onToggleMic, onToggleVideo, onLeave }) {
  const on = 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300';
  const off = 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300';
  return (
    <div className="grid grid-cols-3 gap-2">
      <button onClick={onToggleMic} className={`p-3 rounded-lg font-medium transition ${micOn ? on : off}`}>
        {micOn ? 'Mic on' : 'Mic off'}
      </button>
      <button
        onClick={onToggleVideo}
        disabled={!hasVideo}
        title={hasVideo ? '' : 'No camera detected'}
        className={`p-3 rounded-lg font-medium transition disabled:opacity-50 ${videoOn ? on : off}`}
      >
        {videoOn ? 'Cam on' : 'Cam off'}
      </button>
      <button onClick={onLeave} className="p-3 rounded-lg font-medium bg-white text-red-600 hover:bg-red-50 border border-red-300 transition">
        Leave
      </button>
    </div>
  );
}
