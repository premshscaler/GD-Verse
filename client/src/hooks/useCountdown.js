import { useEffect, useState } from 'react';

/**
 * Remaining whole seconds until `endsAt` (server epoch ms).
 * Always derived from the deadline (never decremented), so it cannot drift or flicker.
 * `offset` = serverNow - clientNow, so every device shows the same number.
 */
export default function useCountdown(endsAt, offset = 0) {
  const calc = () => (endsAt ? Math.max(0, Math.ceil((endsAt - (Date.now() + offset)) / 1000)) : null);
  const [left, setLeft] = useState(calc);

  useEffect(() => {
    setLeft(calc());
    if (!endsAt) return undefined;
    const id = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, offset]);

  return left;
}

export const formatClock = (s) => {
  if (s == null) return '--:--';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
