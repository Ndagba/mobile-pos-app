import CryptoJS from 'crypto-js';

/**
 * Computes the `offline_session_hash` used as the transaction idempotency key.
 *
 * BYTE-IDENTICAL to mobile's `SyncManager.generateOfflineSessionHash`
 * (mobile/src/services/SyncManager.ts):
 *
 *   const data = `${deviceId}-${transactionId}-${timestamp}`;
 *   return crypto.SHA256(data).toString();
 *
 * The backend enforces this value `@unique`, so a desktop-created sale and a
 * mobile-created sale must hash the same inputs to the same digest, and a retry
 * of the same sale must collide (dedupe) rather than double-post. Do NOT change
 * the input string format, the algorithm (SHA-256), or the output encoding
 * (crypto-js default hex) without changing mobile in lockstep.
 */
export function generateOfflineSessionHash(
  deviceId: string,
  transactionId: string,
  timestamp: number
): string {
  const data = `${deviceId}-${transactionId}-${timestamp}`;
  return CryptoJS.SHA256(data).toString();
}
