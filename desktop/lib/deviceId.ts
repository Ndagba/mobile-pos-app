/**
 * Stable per-browser device identifier for the `offline_session_hash`.
 *
 * Mirrors mobile's device-id scheme (mobile SyncManager / SecureStore
 * `'device_id'`): a persisted `device_${timestamp}_${rand}` string, falling back
 * to `'unknown'` when there is no storage (SSR, or storage blocked). The value
 * only needs to be stable and reasonably unique per install — the transaction's
 * uniqueness/idempotency comes from the SHA-256 hash of (deviceId, txId, ts).
 */
const DEVICE_ID_KEY = 'jaypos_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown';
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}
