import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** Re-runs a synchronous SQLite query every time the screen gains focus. */
export function useFocusQuery<T>(query: () => T, deps: unknown[] = []): [T, () => void] {
  const [data, setData] = useState<T>(query);
  const reload = useCallback(() => setData(query()), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(reload);
  return [data, reload];
}
