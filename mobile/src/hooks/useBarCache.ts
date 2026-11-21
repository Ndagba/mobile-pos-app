import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';

/**
 * In-memory "last result" for bar screens, so a screen opens straight away with
 * the figures it showed last time and refreshes quietly in the background,
 * instead of a blank screen and a spinner on every visit.
 *
 * - Memory only (bar data is online-only and changes every few seconds — it is
 *   never written to phone storage).
 * - Keyed by the signed-in user, so a different person signing in on the same
 *   phone never sees the previous user's orders or balance. `clearBarCache()`
 *   also runs on logout.
 */
const memory = new Map<string, unknown>();

export function clearBarCache() {
  memory.clear();
}

export function useBarCache<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const userId = useSelector((s: RootState) => s.auth.user?.id ?? 'anon');
  const fullKey = `${userId}:${key}`;
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key: fullKey,
    value: memory.has(fullKey) ? (memory.get(fullKey) as T) : initial,
  }));

  // The key changed (e.g. another tab or date): show that key's last value, if any.
  let value = state.value;
  if (state.key !== fullKey) {
    value = memory.has(fullKey) ? (memory.get(fullKey) as T) : initial;
    setState({ key: fullKey, value });
  }

  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setState((cur) => {
        const base = cur.key === fullKey ? cur.value : ((memory.has(fullKey) ? memory.get(fullKey) : initial) as T);
        const next = typeof v === 'function' ? (v as (p: T) => T)(base) : v;
        memory.set(fullKey, next);
        return { key: fullKey, value: next };
      });
    },
    // `initial` is a literal default at every call site; the key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullKey]
  );

  return [value, set];
}
