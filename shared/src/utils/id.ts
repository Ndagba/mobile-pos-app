/**
 * Generates a RFC-4122 v4 UUID.
 *
 * Kept identical to the mobile implementation (mobile/src/utils/generateId.ts):
 * uses Math.random() rather than crypto.getRandomValues() so it behaves the same
 * across React Native's Hermes engine and the browser. Sufficient for local
 * entity IDs; transaction security is handled separately by the SHA-256
 * offline_session_hash.
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
