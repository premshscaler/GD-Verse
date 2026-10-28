import { useEffect, useRef } from 'react';

function Tile({ stream, name, muted, mic, video, speaking, isSelf }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  const showVideo = !!stream && video !== false;
  return (
    <div className={`relative bg-gray-900 rounded-xl overflow-hidden aspect-video ring-4 transition ${speaking ? 'ring-green-400' : 'ring-transparent'}`}>
      {/* The element stays mounted even with video off so remote audio keeps playing. */}
      <video ref={ref} autoPlay playsInline muted={muted} className={`w-full h-full object-cover ${isSelf ? '-scale-x-100' : ''} ${showVideo ? '' : 'invisible'}`} />
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white text-2xl font-semibold flex items-center justify-center">
            {(name || '?').trim().charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 flex items-center justify-between text-white text-sm">
        <span className="truncate">{name}{isSelf ? ' (you)' : ''}</span>
        <span className="text-xs">{mic === false ? 'muted' : speaking ? 'speaking' : ''}</span>
      </div>
    </div>
  );
}

export default function VideoGrid({ localStream, self, participants, remoteStreams, micOn, videoOn, speakingSelf }) {
  const others = participants.filter((p) => p.clientId !== self?.clientId && p.connected);
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      <Tile stream={localStream} name={self?.name || 'You'} muted isSelf mic={micOn} video={videoOn} speaking={speakingSelf} />
      {others.map((p) => (
        <Tile key={p.socketId} stream={remoteStreams.get(p.socketId)} name={p.name} mic={p.mic} video={p.video} speaking={p.speaking} />
      ))}
    </div>
  );
}
