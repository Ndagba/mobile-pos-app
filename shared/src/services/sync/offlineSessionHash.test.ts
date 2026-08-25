import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { generateOfflineSessionHash } from './offlineSessionHash';

describe('generateOfflineSessionHash', () => {
  it('produces a real SHA-256 hex digest of `${deviceId}-${transactionId}-${timestamp}`', () => {
    // Cross-check crypto-js against Node's *independent* SHA-256 implementation.
    // If these agree, the digest is a genuine SHA-256 and is portable / identical
    // to any other correct SHA-256 (including mobile's crypto-js).
    const deviceId = 'device-abc';
    const transactionId = 'txn-123';
    const timestamp = 1700000000000;
    const expected = createHash('sha256')
      .update(`${deviceId}-${transactionId}-${timestamp}`)
      .digest('hex');

    expect(generateOfflineSessionHash(deviceId, transactionId, timestamp)).toBe(expected);
  });

  it('is a 64-char lowercase hex string', () => {
    expect(generateOfflineSessionHash('d', 't', 1)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same inputs (idempotency-key stability)', () => {
    const a = generateOfflineSessionHash('dev', 'tx', 42);
    const b = generateOfflineSessionHash('dev', 'tx', 42);
    expect(a).toBe(b);
  });

  it('changes when any input changes', () => {
    const base = generateOfflineSessionHash('dev', 'tx', 42);
    expect(generateOfflineSessionHash('dev2', 'tx', 42)).not.toBe(base);
    expect(generateOfflineSessionHash('dev', 'tx2', 42)).not.toBe(base);
    expect(generateOfflineSessionHash('dev', 'tx', 43)).not.toBe(base);
  });
});
