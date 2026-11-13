import ApiClient from './ApiClient';
import {
  GoodsReceipt,
  POListItem,
  POStatus,
  POWriteLine,
  PurchaseOrderDetail,
  ReceiveLineInput,
  normalizeListItem,
  normalizePurchaseOrder,
  normalizeReceipt,
} from '../utils/purchaseOrders';

/**
 * Thin wrapper over the existing `/v1/purchase-orders` API (same 7 routes the
 * desktop uses), on the app's shared `ApiClient`.
 *
 * Purchasing is ONLINE-ONLY. `ApiClient.post/patch` fall back to "queue + echo
 * the request body" when the network is down, and that queue is never replayed —
 * so every write here refuses up-front when offline and also rejects an echoed
 * (id-less) response, rather than pretending a PO or a stock receipt was saved.
 */
export const PO_OFFLINE_MESSAGE =
  'You are offline. Purchasing needs a connection — nothing was saved. Reconnect and try again.';

function assertOnline() {
  if (!ApiClient.getOnlineStatus()) throw new Error(PO_OFFLINE_MESSAGE);
}

function assertServerRow(res: any) {
  if (!res || typeof res !== 'object' || !res.id) throw new Error(PO_OFFLINE_MESSAGE);
}

const list = (res: any): any[] => (Array.isArray(res) ? res : res?.data ?? []);

export interface POListFilters {
  status?: POStatus | 'all';
  supplierId?: string | null;
  branchId?: string | null;
}

const PurchaseOrderService = {
  /** Server-scoped to the caller's authorized branches; an admin may narrow by branch. */
  async list(filters: POListFilters = {}): Promise<POListItem[]> {
    const params = ['limit=200'];
    if (filters.status && filters.status !== 'all') params.push(`status=${encodeURIComponent(filters.status)}`);
    if (filters.supplierId) params.push(`supplier_id=${encodeURIComponent(filters.supplierId)}`);
    if (filters.branchId) params.push(`branch_id=${encodeURIComponent(filters.branchId)}`);
    const res: any = await ApiClient.get(`/purchase-orders?${params.join('&')}`);
    return list(res).map(normalizeListItem);
  },

  async get(id: string): Promise<PurchaseOrderDetail> {
    const res: any = await ApiClient.get(`/purchase-orders/${id}`);
    return normalizePurchaseOrder(res);
  },

  async receipts(id: string): Promise<GoodsReceipt[]> {
    const res: any = await ApiClient.get(`/purchase-orders/${id}/receipts`);
    return list(res).map(normalizeReceipt);
  },

  /** Creates a DRAFT. Totals are computed by the server from each product's tax_rate. */
  async create(input: {
    branch_id: string;
    supplier_id: string;
    po_number?: string | null;
    expected_date?: string | null;
    notes?: string | null;
    items: POWriteLine[];
  }): Promise<PurchaseOrderDetail> {
    assertOnline();
    const res: any = await ApiClient.post('/purchase-orders', input);
    assertServerRow(res);
    return normalizePurchaseOrder(res);
  },

  async setStatus(id: string, status: 'ordered' | 'cancelled'): Promise<void> {
    assertOnline();
    const res: any = await ApiClient.patch(`/purchase-orders/${id}`, { status });
    assertServerRow(res);
  },

  async remove(id: string): Promise<void> {
    assertOnline();
    await ApiClient.delete(`/purchase-orders/${id}`);
  },

  /**
   * The stock-in transaction. `receipt_hash` makes a retry (double tap, lost
   * response) return the first receipt instead of incrementing stock twice.
   */
  async receive(
    id: string,
    input: {
      received_date?: string | null;
      reference?: string | null;
      receipt_hash: string;
      create_invoice: boolean;
      notes?: string | null;
      items: ReceiveLineInput[];
    }
  ): Promise<GoodsReceipt> {
    assertOnline();
    const res: any = await ApiClient.post(`/purchase-orders/${id}/receipts`, input);
    assertServerRow(res);
    return normalizeReceipt(res);
  },
};

export default PurchaseOrderService;

/** Shared error-to-text helper (same precedence the other screens use). */
export const poApiError = (e: any, fallback = 'Operation failed'): string =>
  e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;
