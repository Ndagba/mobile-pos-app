/**
 * Generates a RFC-4122 v4 UUID.
 *
 * Uses Math.random() instead of crypto.getRandomValues() because
 * React Native's Hermes engine does not expose the Web Crypto API.
 * Sufficient for local entity IDs; transaction security is handled
 * separately by the SHA-256 offline_session_hash.
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
