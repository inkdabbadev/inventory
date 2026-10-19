import { useEffect, useState } from 'react';

/** Delays a fast-changing value (search box) so SQLite isn't queried on every keystroke. */
export function useDebounced<T>(value: T, ms = 180): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
