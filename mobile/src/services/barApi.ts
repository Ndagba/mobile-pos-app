import type {
  BarDashboard,
  BarOrder,
  BarPaymentMethod,
  CashierRemittance,
  CashierSummary,
  CommissionRun,
  MyCommissionLine,
  ReportCatalog,
  ReportTable,
  DamageList,
  DamageReason,
  DamageRecord,
  DayClose,
  DayClosePreview,
  LedgerEntry,
  RemittanceMethod,
} from '@jaypos/shared';
import ApiClient from './ApiClient';

/**
 * Bar / Lounge API client (planning Phases 2–3).
 *
 * The bar flow is ONLINE-ONLY: an order has to reach the Bar Controller and money
 * has to be recorded against the right person. ApiClient's offline fallback queues
 * writes and echoes the request body back as if it had succeeded — for a bar order
 * or a remittance that would fake the action, so every write here refuses up front
 * when offline, and every response is checked to be a real server object.
 */

export class BarOfflineError extends Error {
  constructor() {
    super("You're offline. Bar orders and payments need a connection — reconnect and try again.");
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

const asObject = <T,>(res: any, key: string): T => {
  if (!res || typeof res !== 'object' || !(key in res)) {
    throw new Error('No response from the server. Check your connection and try again.');
  }
  return res as T;
};

const asList = <T,>(res: any): T[] => (Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []);

const query = (params: Record<string, string | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

/** Pull the server's message out of an axios error (falls back to the JS message). */
export function barErrorMessage(e: any, fallback = 'Something went wrong. Please try again.'): string {
  return e?.response?.data?.message || e?.message || fallback;
}

/** Machine-readable detail the server attaches to some errors, e.g. { code: 'OVERPAYMENT', outstanding }. */
export function barErrorDetails(e: any): Record<string, any> | null {
  return e?.response?.data?.details ?? null;
}

export const barApi = {
  // ── Orders (Phase 2) ──
  async submit(body: {
    client_ref: string;
    items: { product_id: string; quantity: number }[];
    table_label?: string;
    notes?: string;
    /** Optional: the server records 'cash' until it is declared after release, unless
     *  the store requires it up front (bar_require_payment_declaration). */
    customer_payment_method?: Exclude<BarPaymentMethod, 'split'>;
    customer_payment_ref?: string;
  }): Promise<BarOrder> {
    requireOnline();
    return asOrder(await ApiClient.post('/bar/orders', body));
  },

  /** Own orders; `from`/`to` are business dates (YYYY-MM-DD) matched on submission time. */
  async mine(status?: string, range: { from?: string; to?: string } = {}): Promise<BarOrder[]> {
    return asList(await ApiClient.get(`/bar/orders/mine${query({ status, from: range.from, to: range.to })}`));
  },

  async queue(status?: string): Promise<BarOrder[]> {
    return asList(await ApiClient.get(`/bar/orders/queue${query({ status })}`));
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

  // ── Reversal requests (Phase 3) ──
  async requestReversal(id: string, reason: string) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/request-reversal`, { reason }));
  },

  async declineReversal(id: string, reason: string) {
    requireOnline();
    return asOrder(await ApiClient.post(`/bar/orders/${id}/decline-reversal`, { reason }));
  },

  // ── Balances (Phase 3): Attendant = own; Controller/manager = anyone in scope ──
  async mySummary(date?: string): Promise<CashierSummary> {
    return asObject(await ApiClient.get(`/bar/me/summary${query({ date })}`), 'outstanding_now');
  },

  /**
   * Everything "My balance" shows, in one round trip. Falls back to the five
   * separate calls when the server predates GET /bar/me/overview (404).
   */
  async myOverview(date?: string): Promise<{
    summary: CashierSummary;
    remittances: CashierRemittance[];
    ledger: LedgerEntry[];
    damages: DamageList | null;
    commission: MyCommissionLine[];
  }> {
    try {
      const res: any = await ApiClient.get(`/bar/me/overview${query({ date })}`);
      return {
        summary: asObject<CashierSummary>(res?.summary, 'outstanding_now'),
        remittances: asList(res?.remittances),
        ledger: asList(res?.ledger),
        damages: res?.damages && typeof res.damages === 'object' && 'totals' in res.damages ? res.damages : null,
        commission: asList(res?.commission),
      };
    } catch (e: any) {
      if (e?.response?.status !== 404) throw e;
      const [summary, remittances, ledger, damages, commission] = await Promise.all([
        this.mySummary(date),
        this.myRemittances(),
        this.myLedger(),
        this.myDamages().catch(() => null),
        this.myCommission().catch(() => [] as MyCommissionLine[]),
      ]);
      return { summary, remittances, ledger, damages, commission };
    }
  },

  async myLedger(): Promise<LedgerEntry[]> {
    return asList(await ApiClient.get('/bar/me/ledger'));
  },

  async myRemittances(): Promise<CashierRemittance[]> {
    return asList(await ApiClient.get('/bar/me/remittances'));
  },

  async dashboard(date?: string): Promise<BarDashboard> {
    return asObject(await ApiClient.get(`/bar/dashboard${query({ date })}`), 'attendants');
  },

  async cashierSummary(id: string, date?: string): Promise<CashierSummary> {
    return asObject(await ApiClient.get(`/bar/cashiers/${id}/summary${query({ date })}`), 'outstanding_now');
  },

  async cashierLedger(id: string): Promise<LedgerEntry[]> {
    return asList(await ApiClient.get(`/bar/cashiers/${id}/ledger`));
  },

  async cashierRemittances(id: string): Promise<CashierRemittance[]> {
    return asList(await ApiClient.get(`/bar/cashiers/${id}/remittances`));
  },

  // ── Money handed over (Phase 3) ──
  async recordRemittance(body: {
    cashier_user_id: string;
    amount: number;
    method: RemittanceMethod;
    reference?: string;
    narration?: string;
    business_date?: string;
    client_ref: string;
    confirm_overpayment?: boolean;
    confirm_duplicate?: boolean;
  }): Promise<CashierRemittance> {
    requireOnline();
    return asObject(await ApiClient.post('/bar/remittances', body), 'received_by');
  },

  async reverseRemittance(id: string, reason: string): Promise<CashierRemittance> {
    requireOnline();
    return asObject(await ApiClient.post(`/bar/remittances/${id}/reverse`, { reason }), 'received_by');
  },

  async writeOff(cashierId: string, amount: number, reason: string) {
    requireOnline();
    return asObject<{ outstanding_after: number }>(
      await ApiClient.post(`/bar/cashiers/${cashierId}/write-off`, { amount, reason }),
      'outstanding_after'
    );
  },

  async adjust(cashierId: string, amount: number, reason: string) {
    requireOnline();
    return asObject<{ outstanding_after: number }>(
      await ApiClient.post(`/bar/cashiers/${cashierId}/adjustment`, { amount, reason }),
      'outstanding_after'
    );
  },

  // ── Damages (Phase 4) — house loss ──
  async recordDamage(body: {
    client_ref: string;
    product_id: string;
    quantity: number;
    reason_code: DamageReason;
    notes?: string;
    responsible_user_id?: string | null;
  }): Promise<DamageRecord> {
    requireOnline();
    return asObject(await ApiClient.post('/bar/damages', body), 'reason_code');
  },

  async damages(params: { date?: string; from?: string; to?: string; include_reversed?: string } = {}): Promise<DamageList> {
    return asObject(await ApiClient.get(`/bar/damages${query(params)}`), 'totals');
  },

  async myDamages(): Promise<DamageList> {
    return asObject(await ApiClient.get('/bar/me/damages'), 'totals');
  },

  async reverseDamage(id: string, reason: string): Promise<DamageRecord> {
    requireOnline();
    return asObject(await ApiClient.post(`/bar/damages/${id}/reverse`, { reason }), 'reason_code');
  },

  // ── Day close + handover (Phase 4) ──
  async dayClosePreview(date?: string): Promise<DayClosePreview> {
    return asObject(await ApiClient.get(`/bar/day-close/preview${query({ date })}`), 'figures');
  },

  async submitDayClose(body: { business_date?: string; counted_cash: number; variance_reason?: string; notes?: string }): Promise<DayClose> {
    requireOnline();
    return asObject(await ApiClient.post('/bar/day-close', body), 'counted_cash');
  },

  async dayCloses(params: { status?: string; date?: string; mine?: string } = {}): Promise<DayClose[]> {
    return asList(await ApiClient.get(`/bar/day-close${query(params)}`));
  },

  async acknowledgeDayClose(
    id: string,
    body: { acknowledged_amount: number; note?: string; variance_treatment?: 'absorb' | 'charge_controller' }
  ): Promise<DayClose> {
    requireOnline();
    return asObject(await ApiClient.post(`/bar/day-close/${id}/acknowledge`, body), 'counted_cash');
  },

  async reopenDayClose(id: string, reason: string): Promise<DayClose> {
    requireOnline();
    return asObject(await ApiClient.post(`/bar/day-close/${id}/reopen`, { reason }), 'counted_cash');
  },

  // ── Commission (Phase 5) ──
  async commissionRuns(status?: string): Promise<CommissionRun[]> {
    return asList(await ApiClient.get(`/bar/commission${query({ status })}`));
  },

  async commissionRun(id: string): Promise<CommissionRun> {
    return asObject(await ApiClient.get(`/bar/commission/${id}`), 'lines');
  },

  async draftCommission(body: { period_start: string; period_end: string; branch_id?: string }): Promise<CommissionRun> {
    requireOnline();
    return asObject(await ApiClient.post('/bar/commission', body), 'lines');
  },

  async postCommission(id: string): Promise<CommissionRun> {
    requireOnline();
    return asObject(await ApiClient.post(`/bar/commission/${id}/post`, {}), 'lines');
  },

  async cancelCommission(id: string, reason: string): Promise<CommissionRun> {
    requireOnline();
    return asObject(await ApiClient.post(`/bar/commission/${id}/cancel`, { reason }), 'lines');
  },

  async payCommissionLine(lineId: string, method: RemittanceMethod, reference?: string): Promise<CommissionRun> {
    requireOnline();
    return asObject(await ApiClient.post(`/bar/commission/lines/${lineId}/pay`, { method, reference }), 'lines');
  },

  async myCommission(): Promise<MyCommissionLine[]> {
    return asList(await ApiClient.get('/bar/me/commission'));
  },

  // ── Reports (Phase 5) ──
  async reportCatalog(): Promise<ReportCatalog> {
    return asObject(await ApiClient.get('/bar/reports'), 'reports');
  },

  async report(key: string, from?: string, to?: string): Promise<ReportTable> {
    return asObject(await ApiClient.get(`/bar/reports/${key}${query({ from, to })}`), 'columns');
  },
};
