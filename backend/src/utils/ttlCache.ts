/**
 * Tiny in-process TTL cache for hot, rarely-changing reads (store mode, bar
 * business-day settings) that every /v1/bar request needs.
 *
 * - Values live for `ttlMs`, then the next read goes back to the DB.
 * - Writers call `invalidate(key)` so a change on this process is seen at once.
 * - Disabled under NODE_ENV=test so unit suites with mockPrisma never see a
 *   value cached by an earlier test.
 *
 * Never use this for permissions that must be fresh per request (role,
 * operational profile) — those are still read from the DB every time.
 */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();

  constructor(private ttlMs: number, private maxEntries = 1000) {}

  private get enabled() {
    return process.env.NODE_ENV !== 'test';
  }

  async get(key: string, load: () => Promise<V>): Promise<V> {
    if (this.enabled) {
      const hit = this.store.get(key);
      if (hit && hit.expires > Date.now()) return hit.value;
    }
    const value = await load();
    if (this.enabled) {
      if (this.store.size >= this.maxEntries) this.store.clear();
      this.store.set(key, { value, expires: Date.now() + this.ttlMs });
    }
    return value;
  }

  invalidate(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}
