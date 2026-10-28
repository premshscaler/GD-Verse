const fmt = (ms) => { const s = Math.round((ms || 0) / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };

export default function UserList({ users, contributions = [], selfClientId }) {
  if (!users.length) return <p className="text-gray-500 text-sm text-center py-4">No participants yet</p>;
  const stat = (id) => contributions.find((c) => c.clientId === id);
  return (
    <ul className="space-y-2">
      {users.map((u) => {
        const c = stat(u.clientId);
        return (
          <li key={u.clientId} className="border-b border-gray-100 pb-2 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-gray-800 truncate">
                {u.name}
                {u.clientId === selfClientId && <span className="text-gray-400 font-normal"> (you)</span>}
                {u.isHost && <span className="ml-2 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">host</span>}
              </span>
              <span className="flex items-center gap-2 text-xs shrink-0">
                {!u.connected && <span className="text-amber-600">reconnecting...</span>}
                {u.speaking && <span className="text-blue-600 animate-pulse">speaking</span>}
                <span className={u.mic ? 'text-green-600' : 'text-red-600'}>{u.mic ? 'mic' : 'muted'}</span>
                <span className={u.video ? 'text-green-600' : 'text-gray-400'}>{u.video ? 'cam' : 'no cam'}</span>
              </span>
            </div>
            {c && c.speakingMs > 0 && <div className="text-xs text-gray-500 mt-1">Spoke {fmt(c.speakingMs)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
