/**
 * Platform-neutral connectivity surface.
 *
 * Mobile implements this with NetInfo; desktop implements it with
 * `navigator.onLine` + the window `online`/`offline` events. Shared code
 * (sync-on-reconnect, "pending" badges) subscribes here rather than to any
 * platform API directly.
 */
export interface INetwork {
  /** Current connectivity as last known. */
  isOnline(): boolean;
  /**
   * Subscribe to connectivity changes. Returns an unsubscribe function.
   * The listener receives the new online state.
   */
  subscribe(listener: (online: boolean) => void): () => void;
}
