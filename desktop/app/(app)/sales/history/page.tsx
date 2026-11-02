'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, WifiOff, RefreshCcw, Printer, Download } from 'lucide-react';
import { toast } from 'sonner';
import { naira } from '@jaypos/shared';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { useNetworkStatus } from '@/lib/useNetwork';
import { numOr0 } from '@/lib/normalize';
import { cn } from '@/lib/utils';
import { useTransactions, type TransactionRow, type TransactionHistory } from '@/hooks/useTransactions';
import { useSyncStore } from '@/store/syncStore';
import { useUsers } from '@/hooks/useUsers';
import { ReceiptModal, type ReceiptData } from '@/components/pos/ReceiptModal';
import { apiClient } from '@/lib/apiClient';
import { isAdmin } from '@/lib/roles';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';

const PAGE_SIZE = 50;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  mobile_wallet: 'Mobile wallet',
  split: 'Split',
};

/** Human label for a payment method, titleising any unmapped value. */
function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Escape one CSV cell. */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sum of total_amount grouped by payment method (for the report breakdown). */
function paymentTotals(rows: TransactionRow[]): { method: string; total: number }[] {
  const map = new Map<string, number>();
  for (const tx of rows) {
    const m = tx.payment_method || 'other';
    map.set(m, (map.get(m) ?? 0) + numOr0(tx.total_amount));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([method, total]) => ({ method, total }));
}

function statusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-success-soft text-success';
    case 'refunded':
      return 'bg-danger-soft text-danger';
    case 'voided':
      return 'bg-muted text-text-muted';
    default:
      return 'bg-warning-soft text-warning';
  }
}

function customerName(tx: TransactionRow): string {
  return tx.customer?.first_name?.trim() || 'Walk-in';
}

/** Comma-separated product names for a sale (with ×qty when > 1); falls back to a count. */
function itemsSummary(tx: TransactionRow): string {
  const items = tx.transaction_items ?? [];
  if (items.length === 0) {
    const n = tx.item_count ?? 0;
    return `${n} item${n === 1 ? '' : 's'}`;
  }
  return items
    .map((it) => {
      const name = it.product?.name?.trim() || 'Item';
      const q = Number(it.quantity) || 0;
      return q > 1 ? `${name} ×${q}` : name;
    })
    .join(', ');
}

const selectClass =
  'h-9 rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink-2 focus:outline-none';

/**
 * Transaction history.
 *
 * Server-backed (`GET /v1/transactions`) with date/payment/status/user filters and
 * basic paging. Offline, the server list is unavailable, so the page shows the
 * count of sales still pending sync (from Dexie via `syncStore`) rather than an
 * empty table — those rows appear here once they drain to the backend.
 */
export default function HistoryPage() {
  const online = useNetworkStatus();
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const refreshPendingCount = useSyncStore((s) => s.refreshPendingCount);
  const user = useAuthStore((s) => s.user);
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  const activeBranchId = selectedBranchId ?? user?.branch_id ?? undefined;
  const { data: users = [] } = useUsers(activeBranchId);

  // The backend's GET /transactions is NOT role-scoped — it returns the whole
  // store unless a userId is passed. So a cashier (not super-admin) is pinned to
  // their own sales here, and the cashier filter + refund action are hidden for
  // them. Admins/managers keep the full store view and the cashier filter.
  const admin = isAdmin(user);
  const cashierScoped = user?.role === 'cashier' && !user?.is_super_admin;

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(0);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [exporting, setExporting] = useState(false);

  // Reset to the first page whenever a filter changes.
  useEffect(() => {
    setPage(0);
  }, [dateFrom, dateTo, paymentMethod, status, userId]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  // A cashier is always scoped to their own id; others use the chosen filter.
  const effectiveUserId = cashierScoped ? user?.id : userId || undefined;

  const filters = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      paymentMethod: paymentMethod || undefined,
      status: status || undefined,
      userId: effectiveUserId,
      includeItems: true,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [dateFrom, dateTo, paymentMethod, status, effectiveUserId, page]
  );

  const { data, isLoading, isError, isFetching, refetch } = useTransactions(filters);
  const rows = data?.data ?? [];
  const grandTotal = rows.reduce((sum, tx) => sum + numOr0(tx.total_amount), 0);
  const payTotals = paymentTotals(rows);
  const total = data?.pagination.total ?? 0;
  const pages = data?.pagination.pages ?? 0;
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setPaymentMethod('');
    setStatus('');
    setUserId('');
  };

  const handleRefund = async (txId: string) => {
    const reason = window.prompt('Reason for refund:');
    if (!reason) return;

    try {
      await apiClient.post(`/transactions/${txId}/refund`, { reason });
      void refetch();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Refund failed');
    }
  };

  /** Print the on-screen report (CSS @media print isolates #report-print). */
  const handlePrintReport = () => window.print();

  /** Download the full filtered report (all pages) as CSV, honouring the cashier scope. */
  const handleDownload = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '10000');
      params.set('offset', '0');
      if (dateFrom) params.set('dateFrom', `${dateFrom}T00:00:00`);
      if (dateTo) params.set('dateTo', `${dateTo}T23:59:59`);
      if (paymentMethod) params.set('paymentMethod', paymentMethod);
      if (status) params.set('status', status);
      if (effectiveUserId) params.set('userId', effectiveUserId);
      params.set('includeItems', 'true');

      const res = await apiClient.get<TransactionHistory>(`/transactions?${params.toString()}`);
      const all = res.data ?? [];
      if (all.length === 0) {
        toast('No sales to export for these filters.');
        return;
      }

      // Dated report header, then the table, then the per-method + grand totals.
      const periodLabel = dateFrom || dateTo ? `${dateFrom || '…'} to ${dateTo || '…'}` : 'All dates';
      const lines: string[] = [];
      lines.push([cashierScoped ? 'My sales report' : 'Sales report'].map(csvCell).join(','));
      lines.push(['Generated', new Date().toLocaleString()].map(csvCell).join(','));
      lines.push(['Period', periodLabel].map(csvCell).join(','));
      if (cashierScoped && user?.first_name) lines.push(['Cashier', user.first_name].map(csvCell).join(','));
      lines.push('');

      const headers = ['Date', 'Receipt', 'Cashier', 'Customer', 'Items', 'Payment', 'Status', 'Total'];
      lines.push(headers.map(csvCell).join(','));
      for (const tx of all) {
        lines.push(
          [
            new Date(tx.created_at).toLocaleString(),
            tx.receipt_number || tx.id,
            tx.user?.first_name ?? '',
            tx.customer?.first_name?.trim() || 'Walk-in',
            itemsSummary(tx),
            paymentLabel(tx.payment_method),
            tx.status,
            numOr0(tx.total_amount),
          ].map(csvCell).join(',')
        );
      }

      lines.push('');
      for (const p of paymentTotals(all)) {
        lines.push(['', '', '', '', '', '', `Total — ${paymentLabel(p.method)}`, p.total].map(csvCell).join(','));
      }
      const reportGrandTotal = all.reduce((sum, tx) => sum + numOr0(tx.total_amount), 0);
      lines.push(['', '', '', '', '', '', 'GRAND TOTAL', reportGrandTotal].map(csvCell).join(','));

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Sales report downloaded.');
    } catch {
      toast.error('Could not export the report.');
    } finally {
      setExporting(false);
    }
  };

  const handleReprint = async (txId: string) => {
    try {
      const tx = await apiClient.get<any>(`/transactions/${txId}`);

      setReceiptData({
        status: tx.status === 'completed' ? 'completed' : 'offline',
        receiptNumber: tx.receipt_number || tx.id,
        lines: tx.transaction_items.map((it: any) => ({
          name: it.product?.name ?? 'Product',
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          line_total: Number(it.line_total),
        })),
        subtotal: Number(tx.subtotal),
        tax_amount: Number(tx.tax_amount),
        discount_amount: Number(tx.discount_amount),
        total: Number(tx.total_amount),
        paymentLabel: PAYMENT_LABELS[tx.payment_method] ?? tx.payment_method,
        customerName: tx.customer?.first_name || 'Walk-in',
        storeLabel: 'JayPOS',
        branchLabel: tx.branch?.name ?? 'Store',
        footer: 'Thank you for your purchase!',
        at: new Date(tx.created_at),
      });
    } catch (e: any) {
      alert(e.response?.data?.message || 'Could not load receipt');
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title={cashierScoped ? 'My sales' : 'Sales history'}
        subtitle={
          online && data
            ? `${cashierScoped ? 'Your ' : ''}${total} transaction(s) · net ${naira(data.netSum)}`
            : undefined
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!online || total === 0}
              onClick={handlePrintReport}
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!online || total === 0 || exporting}
              onClick={handleDownload}
            >
              {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              Download
            </Button>
            <Link href="/sales">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Back to sales
              </Button>
            </Link>
          </>
        }
      />
      {pendingCount > 0 && (
        <div className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {pendingCount} sale(s) pending sync. They’ll appear here once synced to the server.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label="From date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className={selectClass}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <input
          type="date"
          aria-label="To date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className={selectClass}
        />
        <select
          aria-label="Payment method"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className={selectClass}
        >
          <option value="">All payments</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="transfer">Transfer</option>
          <option value="mobile_wallet">Mobile wallet</option>
          <option value="split">Split</option>
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="refunded">Refunded</option>
          <option value="voided">Voided</option>
        </select>
        {!cashierScoped && (
          <select
            aria-label="Cashier"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={selectClass}
          >
            <option value="">All cashiers</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.first_name} {u.last_name}
              </option>
            ))}
          </select>
        )}
        {(dateFrom || dateTo || paymentMethod || status || (!cashierScoped && userId)) && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>
      {/* Body */}
      <div id="report-print" className="min-h-0 flex-1 overflow-auto rounded-card border border-border">
        {/* Heading shown only on the printed page */}
        <div className="print-only mb-3 p-4">
          <h2 className="text-lg font-bold">{cashierScoped ? 'My sales report' : 'Sales report'}</h2>
          <p className="text-xs">
            {user?.first_name ? `${user.first_name} · ` : ''}
            {dateFrom || dateTo ? `${dateFrom || '…'} to ${dateTo || '…'}` : 'All dates'} ·
            Printed {new Date().toLocaleString()}
          </p>
        </div>
        {!online ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <WifiOff className="h-8 w-8" />
            <p className="text-sm">You’re offline — transaction history is unavailable.</p>
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center py-16">
            <Spinner />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-destructive">
            Could not load transactions. Please try again.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No transactions match these filters.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-subtle text-left text-2xs font-bold uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Receipt / Cashier</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Items</th>
                <th className="px-4 py-2.5">Payment</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {rows.map((tx) => (
                <tr key={tx.id} className="hover:bg-surface-subtle">
                  <td className="whitespace-nowrap px-4 py-2 text-text-muted">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-ink-2">{tx.receipt_number || tx.id.slice(0, 8)}</span>
                      <span className="text-xs text-text-muted">{tx.user?.first_name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">{customerName(tx)}</td>
                  <td className="px-4 py-2">
                    <span className="block max-w-[240px] truncate text-ink-2" title={itemsSummary(tx)}>
                      {itemsSummary(tx)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {PAYMENT_LABELS[tx.payment_method] ?? tx.payment_method}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                        statusClass(tx.status)
                      )}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {naira(numOr0(tx.total_amount))}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {admin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={tx.status !== 'completed'}
                          onClick={() => handleRefund(tx.id)}
                        >
                          <RefreshCcw className="mr-1 h-3 w-3" />
                          Refund
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleReprint(tx.id)}>
                        <Printer className="mr-1 h-3 w-3" />
                        Receipt
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-subtle">
              {payTotals.map((p) => (
                <tr key={p.method} className="border-t border-divider text-text-muted">
                  <td className="px-4 py-1.5 text-right" colSpan={6}>
                    {paymentLabel(p.method)}
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums text-ink-2">
                    {naira(p.total)}
                  </td>
                  <td className="px-4 py-1.5" />
                </tr>
              ))}
              <tr className="border-t-2 border-border-strong font-bold text-ink">
                <td className="px-4 py-2.5 text-right" colSpan={6}>
                  Grand total{pages > 1 ? ' (this page)' : ''}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{naira(grandTotal)}</td>
                <td className="px-4 py-2.5" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      {/* Pagination */}
      {online && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {rangeStart}–{rangeEnd} of {total}
            {isFetching && ' · updating…'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <ReceiptModal data={receiptData} onClose={() => setReceiptData(null)} />
    </div>
  );
}
