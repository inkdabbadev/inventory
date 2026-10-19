import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { isCloudEnabled } from '../lib/neon';
import { syncNow } from '../services/sync';

const SYNC_INTERVAL_MS = 30_000;

/** Keeps the offline-first SQLite database reconciled with Neon while the app is active. */
export function AutoSync() {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const online = useRef(false);

  useEffect(() => {
    if (!isCloudEnabled) return;

    const run = () => {
      if (appState.current === 'active' && online.current) syncNow().catch(() => {});
    };

    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      const wasOffline = !online.current;
      online.current = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (online.current && wasOffline) run();
    });
    const appSubscription = AppState.addEventListener('change', (nextState) => {
      const returning = appState.current !== 'active' && nextState === 'active';
      appState.current = nextState;
      if (returning) run();
    });
    const timer = setInterval(run, SYNC_INTERVAL_MS);

    return () => {
      unsubscribeNetwork();
      appSubscription.remove();
      clearInterval(timer);
    };
  }, []);

  return null;
}
