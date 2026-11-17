import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Run `fn` now and then every `intervalMs` — but only while the screen is focused
 * and the app is in the foreground (saves battery and data). No WebSockets: the
 * Bar queue refreshes by short polling (project guardrail).
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | null = null;
      const start = () => {
        if (timer) return;
        fnRef.current();
        timer = setInterval(() => fnRef.current(), intervalMs);
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
      };
      start();
      const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
      return () => {
        stop();
        sub.remove();
      };
    }, [intervalMs])
  );
}
