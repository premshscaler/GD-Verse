export default function Toasts({ toasts, dismiss }) {
  if (!toasts.length) return null;
  const tone = { info: 'bg-gray-900', warn: 'bg-amber-600', error: 'bg-red-600', ok: 'bg-green-600' };
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 w-80 max-w-[90vw]" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${tone[t.kind] || tone.info} text-white text-sm rounded-lg shadow-lg px-4 py-3 flex items-start gap-3`}>
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-80 hover:opacity-100" aria-label="Dismiss">x</button>
        </div>
      ))}
    </div>
  );
}
