import type { BarOrder, BarPaymentMethod } from '@jaypos/shared';
import ApiClient from './ApiClient';

/**
 * Bar / Lounge API client (planning Phase 2).
 *
 * The bar order flow is ONLINE-ONLY: an order has to reach the Bar Controller.
 * ApiClient's offline fallback queues writes and echoes the request body back as
 * if it had succeeded — for a bar order that would fake a submit or a release, so
 * every write here refuses up front when offline, and every response is checked
 * to be a real server order.
 */

export class BarOfflineError extends Error {
  constructor() {
    super("You're offline. Bar orders need a connection — reconnect and try again.");
    this.name = 'BarOfflineError';
  }
}

const requireOnline = () => {
  if (!ApiClient.getOnlineStatus()) throw new BarOfflineError();
};

const asOrder = (res: any): BarOrder => {
  // A genuine server order always has id + order_number + status.
  if (!res || typeof res !== 'object' || !res.id || !res.order_number || !res.status) {
    throw new Error('No response from the server. Check your connection and try again.');
  }
  return res as BarOrder;
};

const asList = (res: any): BarOrder[] => (Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []);

/** Pull the server's message out of an axios error (falls back to the JS message). */
export function barErrorMessage(e: any, fallback = 'Something went wrong. Please try again.'): string {
  return e?.response?.data?.message || e?.message || fallback;
}

export const barApi = {
  async submit(body: {
    client_ref: string;
    items: { product_id: string; quantity: number }[];
    table_label?: string;
    notes?: string;
    customer_payment_method: Exclude<BarPaymentMethod, 'split'>;
    customer_payment_ref?: string;
  }): Promise<BarOrder> {
    requireOnline();
    return asOrder(await ApiClient.post('/bar/orders', body));
  },

  async mine(status?: string): Promise<BarOrder[]> {
    return asList(await ApiClient.get(`/bar/orders/mine${status ? `?status=${encodeURIComponent(status)}` : ''}`));
  },

  async queue(status?: string): Promise<BarOrder[]> {
    return asList(await ApiClient.get(`/bar/orders/queue${status ? `?status=${encodeURIComponent(status)}` : ''}`));
  },

  async get(id: string): Promise<BarOrder> {
    return asOrder(await ApiClient.get(`/bar/orders/${id}`));
  },

  async accept(id: string) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/accept`, {}));
  },

  async release(id: string) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/release`, {}));
  },

  async reject(id: string, reason: string) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/reject`, { reason }));
  },

  async cancel(id: string, reason: string) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/cancel`, { reason }));
  },

  async fulfil(id: string, lines?: { item_id: string; quantity: number }[], reduction_reason?: string) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/fulfil`, { lines, reduction_reason }));
  },

  async declarePayment(
    id: string,
    method: BarPaymentMethod,
    opts: { splits?: { cash: number; card: number; transfer: number }; reference?: string } = {}
  ) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/payment`, { method, ...opts }));
  },

  async reverse(id: string, reason: string) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/reverse`, { reason }));
  },
};
